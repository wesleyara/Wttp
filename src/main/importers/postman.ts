/**
 * Postman Collection v2.1 e Postman Environment (EP-08-T02). Um único módulo cobre os
 * dois porque são o mesmo botão "Import" no Postman e o mesmo `ImportFormat` aqui —
 * `detect`/`normalize` decidem pelo shape do JSON: `info.schema` aponta para collection,
 * `_postman_variable_scope` para environment. Environment normaliza direto para
 * `NormalizedEnvironment`, sem pasta nenhuma; collection normaliza para uma árvore de
 * pastas/requests mais as variáveis de collection do Postman, que caem no nível
 * "collection/pasta" do resolvedor de `{{var}}` (EP-06), não num environment do Wttp —
 * é o nível que corresponde de fato ao escopo de `variable[]` no Postman.
 *
 * Scripts (`pm.*`) são convertidos linha a linha: um conjunto pequeno de chamadas com
 * equivalente direto (`pm.environment.set` → `wttp.setVar`, `pm.test` → `test`, os
 * matchers Chai mais comuns → os matchers de `expect`, ver arch-docs/scripting.md) é
 * reescrito; qualquer linha que ainda contenha `pm.` depois disso não tem conversão
 * seura o bastante — vira comentário na linha original, nunca é descartada, e entra no
 * relatório (`notConverted`), mesmo princípio de EP-08-T05 para flags de cURL não
 * suportadas.
 */

import type {
  AuthConfig,
  EnvironmentVariable,
  HttpMethod,
  ImportReportItem,
  KeyValueEntry,
  MultipartEntry,
  RequestBody,
  RequestScripts,
} from "@shared";

import type { Importer, NormalizedImport, NormalizedNode } from "./types";

// ---- Shape do JSON do Postman — só os campos que este importador lê. ----

interface PostmanKeyValue {
  key: string;
  value?: string;
  disabled?: boolean;
}

interface PostmanUrlVariable {
  key: string;
  value?: string;
}

interface PostmanUrlObject {
  raw?: string;
  variable?: PostmanUrlVariable[];
}

type PostmanUrl = string | PostmanUrlObject;

interface PostmanAuthAttr {
  key: string;
  value?: unknown;
}

interface PostmanAuth {
  type: string;
  [attrs: string]: unknown;
}

interface PostmanBody {
  mode?: "raw" | "urlencoded" | "formdata" | "file" | "graphql";
  raw?: string;
  options?: { raw?: { language?: string } };
  urlencoded?: PostmanKeyValue[];
  formdata?: Array<PostmanKeyValue & { type?: "text" | "file"; src?: string | string[] }>;
  file?: { src?: string };
  graphql?: { query?: string; variables?: string };
}

type PostmanDescription = string | { content?: string } | undefined;

interface PostmanScript {
  exec?: string[];
}

interface PostmanEvent {
  listen?: string;
  script?: PostmanScript;
}

interface PostmanRequest {
  method?: string;
  header?: PostmanKeyValue[];
  url?: PostmanUrl;
  auth?: PostmanAuth;
  body?: PostmanBody;
  description?: PostmanDescription;
}

interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  event?: PostmanEvent[];
  auth?: PostmanAuth;
  description?: PostmanDescription;
}

interface PostmanCollection {
  info: { name: string; schema?: string };
  item: PostmanItem[];
  auth?: PostmanAuth;
  event?: PostmanEvent[];
  variable?: PostmanKeyValue[];
}

interface PostmanEnvironmentValue {
  key: string;
  value?: string;
  enabled?: boolean;
}

interface PostmanEnvironmentFile {
  name: string;
  values?: PostmanEnvironmentValue[];
  _postman_variable_scope?: string;
}

type PostmanDocument = PostmanCollection | PostmanEnvironmentFile;

function isCollection(value: unknown): value is PostmanCollection {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const info = candidate.info as Record<string, unknown> | undefined;
  return (
    typeof info === "object" &&
    info !== null &&
    typeof info.schema === "string" &&
    info.schema.includes("collection/v2") &&
    Array.isArray(candidate.item)
  );
}

function isEnvironmentFile(value: unknown): value is PostmanEnvironmentFile {
  if (typeof value !== "object" || value === null) return false;
  const scope = (value as Record<string, unknown>)._postman_variable_scope;
  return scope === "environment" || scope === "globals";
}

// ---- Helpers de conversão de valor ----

function descriptionText(description: PostmanDescription): string | undefined {
  if (!description) return undefined;
  if (typeof description === "string") return description || undefined;
  return description.content || undefined;
}

function splitOnce(text: string, separator: string): [string, string] {
  const index = text.indexOf(separator);
  if (index === -1) return [text, ""];
  return [text.slice(0, index), text.slice(index + separator.length)];
}

function isJsonLike(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === "" || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function toHeaderEntry(entry: PostmanKeyValue): KeyValueEntry {
  return { name: entry.key, value: entry.value ?? "", enabled: !entry.disabled };
}

function mapUrl(url: PostmanUrl | undefined): {
  url: string;
  query: KeyValueEntry[];
  pathParams: KeyValueEntry[];
} {
  const raw = typeof url === "string" ? url : (url?.raw ?? "");
  const [basePath, queryString] = splitOnce(raw, "?");
  const query: KeyValueEntry[] = queryString
    ? [...new URLSearchParams(queryString).entries()].map(([name, value]) => ({
        name,
        value,
        enabled: true,
      }))
    : [];
  const pathParams: KeyValueEntry[] =
    typeof url === "object" && Array.isArray(url.variable)
      ? url.variable.map(variable => ({
          name: variable.key,
          value: variable.value ?? "",
          enabled: true,
        }))
      : [];
  return { url: basePath, query, pathParams };
}

function authAttrString(attrs: unknown, key: string): string {
  if (!Array.isArray(attrs)) return "";
  const found = attrs.find(
    (entry): entry is PostmanAuthAttr =>
      typeof entry === "object" && entry !== null && (entry as PostmanAuthAttr).key === key,
  );
  if (!found) return "";
  const { value } = found;
  return typeof value === "string" ? value : (value?.toString() ?? "");
}

/** Os cinco tipos de auth do Postman com equivalente direto no Wttp; o resto vira relatório. */
function mapAuth(
  auth: PostmanAuth | undefined,
  contextName: string,
  notConverted: ImportReportItem[],
): AuthConfig | undefined {
  if (!auth) return undefined;

  switch (auth.type) {
    case "noauth":
      return { type: "none" };
    case "bearer":
      return { type: "bearer", bearer: { token: authAttrString(auth.bearer, "token") } };
    case "basic":
      return {
        type: "basic",
        basic: {
          username: authAttrString(auth.basic, "username"),
          password: authAttrString(auth.basic, "password"),
        },
      };
    case "apikey": {
      const location = authAttrString(auth.apikey, "in");
      return {
        type: "apikey",
        apikey: {
          key: authAttrString(auth.apikey, "key"),
          value: authAttrString(auth.apikey, "value"),
          in: location === "query" ? "query" : "header",
        },
      };
    }
    default:
      notConverted.push({
        path: `auth de "${contextName}"`,
        reason: `tipo de auth "${auth.type}" sem equivalente no Wttp — configure manualmente`,
      });
      return undefined;
  }
}

function firstSrc(src: string | string[] | undefined): string {
  if (Array.isArray(src)) return src[0] ?? "";
  return src ?? "";
}

function mapBody(
  body: PostmanBody | undefined,
  headers: KeyValueEntry[],
  contextName: string,
  notConverted: ImportReportItem[],
): RequestBody | undefined {
  if (!body || !body.mode) return undefined;

  switch (body.mode) {
    case "raw": {
      const raw = body.raw ?? "";
      if (raw === "") return undefined;
      const language = body.options?.raw?.language;
      const looksJson = language === "json" || (language === undefined && isJsonLike(raw));
      if (looksJson) return { type: "json", json: raw };
      const contentTypeHeader = headers.find(
        header => header.name.toLowerCase() === "content-type",
      );
      return { type: "raw", raw, contentType: contentTypeHeader?.value ?? "text/plain" };
    }
    case "urlencoded":
      return { type: "urlencoded", urlencoded: (body.urlencoded ?? []).map(toHeaderEntry) };
    case "formdata": {
      const multipart: MultipartEntry[] = (body.formdata ?? []).map(entry => ({
        name: entry.key,
        type: entry.type === "file" ? "file" : "text",
        value: entry.type === "file" ? firstSrc(entry.src) : (entry.value ?? ""),
        enabled: !entry.disabled,
      }));
      return { type: "multipart", multipart };
    }
    case "file":
      if (body.file?.src) return { type: "binary", binary: body.file.src };
      notConverted.push({
        path: `body de "${contextName}"`,
        reason: "body de arquivo sem src — não convertido",
      });
      return undefined;
    case "graphql": {
      const query = body.graphql?.query ?? "";
      const rawVariables = body.graphql?.variables ?? "";
      let variables: unknown = rawVariables;
      try {
        variables = rawVariables ? JSON.parse(rawVariables) : undefined;
      } catch {
        // mantém a string bruta se não for JSON válido
      }
      notConverted.push({
        path: `body de "${contextName}"`,
        reason: "GraphQL não tem tipo de body equivalente — convertido para JSON bruto",
      });
      return {
        type: "raw",
        raw: JSON.stringify({ query, variables }, null, 2),
        contentType: "application/json",
      };
    }
    default:
      notConverted.push({
        path: `body de "${contextName}"`,
        reason: `modo de body "${body.mode}" sem equivalente`,
      });
      return undefined;
  }
}

// ---- Conversão de scripts pm.* → wttp/test/expect (arch-docs/scripting.md) ----

const LINE_TRANSFORMS: Array<[RegExp, string]> = [
  [/\bpm\.environment\.set\(/g, "wttp.setVar("],
  [/\bpm\.environment\.get\(/g, "wttp.getVar("],
  [/\bpm\.collectionVariables\.set\(/g, "wttp.setCollectionVar("],
  [/\bpm\.collectionVariables\.get\(/g, "wttp.getCollectionVar("],
  [/\bpm\.test\(/g, "test("],
  [/\bpm\.response\.code\b/g, "res.status"],
  [/\bpm\.response\.json\(\)/g, "res.json"],
  [/\bpm\.response\.text\(\)/g, "res.body"],
  [/\bpm\.expect\(/g, "expect("],
  // Matchers Chai mais comuns, usados em cadeia depois de `expect(...)`.
  [/\.to\.eql\(/g, ".toEqual("],
  [/\.to\.deep\.equal\(/g, ".toEqual("],
  [/\.to\.equal\(/g, ".toBe("],
  [/\.to\.include\(/g, ".toContain("],
  [/\.to\.contain\(/g, ".toContain("],
  [/\.to\.have\.property\(/g, ".toHaveProperty("],
  [/\.to\.match\(/g, ".toMatch("],
  [/\.to\.be\.ok\b/g, ".toBeTruthy()"],
];

function convertScriptLine(line: string): string {
  return LINE_TRANSFORMS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    line,
  );
}

function convertScript(
  exec: string[] | undefined,
  phaseLabel: string,
  contextName: string,
  notConverted: ImportReportItem[],
): string | undefined {
  if (!exec || exec.length === 0) return undefined;

  const lines = exec.map(line => {
    const converted = convertScriptLine(line);
    if (/\bpm\./.test(converted)) {
      notConverted.push({
        path: `script ${phaseLabel} de "${contextName}"`,
        reason: `linha sem conversão automática, preservada como comentário: "${line.trim()}"`,
      });
      return `// ${line}`;
    }
    return converted;
  });

  return lines.join("\n");
}

function buildScripts(
  events: PostmanEvent[] | undefined,
  contextName: string,
  notConverted: ImportReportItem[],
): RequestScripts | undefined {
  if (!events || events.length === 0) return undefined;

  const preRequest = convertScript(
    events.find(event => event.listen === "prerequest")?.script?.exec,
    "pre-request",
    contextName,
    notConverted,
  );
  const tests = convertScript(
    events.find(event => event.listen === "test")?.script?.exec,
    "tests",
    contextName,
    notConverted,
  );

  if (preRequest === undefined && tests === undefined) return undefined;
  return { preRequest, tests };
}

// ---- Normalização ----

function normalizeItem(item: PostmanItem, notConverted: ImportReportItem[]): NormalizedNode {
  if (item.item) {
    return {
      kind: "folder",
      name: item.name,
      auth: mapAuth(item.auth, item.name, notConverted),
      scripts: buildScripts(item.event, item.name, notConverted),
      docs: descriptionText(item.description),
      children: item.item.map(child => normalizeItem(child, notConverted)),
    };
  }

  const request = item.request ?? {};
  const method = (request.method?.toUpperCase() as HttpMethod | undefined) ?? "GET";
  const headers = (request.header ?? []).map(toHeaderEntry);
  const { url, query, pathParams } = mapUrl(request.url);

  return {
    kind: "request",
    name: item.name,
    method,
    url,
    pathParams: pathParams.length > 0 ? pathParams : undefined,
    query: query.length > 0 ? query : undefined,
    headers: headers.length > 0 ? headers : undefined,
    auth: mapAuth(request.auth, item.name, notConverted),
    body: mapBody(request.body, headers, item.name, notConverted),
    scripts: buildScripts(item.event, item.name, notConverted),
    docs: descriptionText(request.description) ?? descriptionText(item.description),
  };
}

function toEnvironmentVariable(value: PostmanEnvironmentValue): EnvironmentVariable {
  return { name: value.key, value: value.value ?? "", enabled: value.enabled !== false };
}

function normalizeEnvironment(env: PostmanEnvironmentFile): NormalizedImport {
  return {
    name: env.name,
    children: [],
    environments: [{ name: env.name, variables: (env.values ?? []).map(toEnvironmentVariable) }],
    notConverted: [],
  };
}

function normalizeCollection(collection: PostmanCollection): NormalizedImport {
  const notConverted: ImportReportItem[] = [];
  const collectionName = collection.info.name;

  const variables: KeyValueEntry[] | undefined =
    collection.variable && collection.variable.length > 0
      ? collection.variable.map(toHeaderEntry)
      : undefined;

  return {
    name: collectionName,
    auth: mapAuth(collection.auth, collectionName, notConverted),
    variables,
    scripts: buildScripts(collection.event, collectionName, notConverted),
    children: collection.item.map(item => normalizeItem(item, notConverted)),
    environments: [],
    notConverted,
  };
}

export const postmanImporter: Importer = {
  format: "postman",
  detect: content => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return false;
    }
    return isCollection(parsed) || isEnvironmentFile(parsed);
  },
  parse: content => JSON.parse(content) as PostmanDocument,
  normalize: parsed => {
    if (isEnvironmentFile(parsed)) return normalizeEnvironment(parsed);
    if (isCollection(parsed)) return normalizeCollection(parsed);
    throw new Error("not a recognizable Postman collection or environment");
  },
};

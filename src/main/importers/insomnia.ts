/**
 * Insomnia v4 export — JSON ou YAML, mesmo shape nos dois (EP-08-T03). Ao contrário do
 * Postman (uma árvore aninhada em `item[]`), o export do Insomnia é uma lista plana de
 * `resources` ligados por `parentId` — o workspace é a raiz, `request_group` são pastas,
 * `request` são requests, e `environment` forma sua própria árvore de herança
 * (environment base → sub-environments) separada da árvore de pastas/requests.
 *
 * Sem `require`/`fs` aqui: `parseInsomniaDocument` tenta JSON e cai para YAML
 * (`import { parse } from "yaml"`, a mesma lib de `storage/parser.ts`) — o mesmo botão
 * "Export" do Insomnia produz os dois formatos com o campo `__export_format` idêntico.
 */

import type {
  AuthConfig,
  EnvironmentVariable,
  HttpMethod,
  ImportReportItem,
  KeyValueEntry,
  MultipartEntry,
  RequestBody,
} from "@shared";

import { parse as parseYaml } from "yaml";

import type { Importer, NormalizedEnvironment, NormalizedImport, NormalizedNode } from "./types";

// ---- Shape do export do Insomnia — só os campos que este importador lê. ----

interface InsomniaKeyValue {
  name?: string;
  value?: string;
  disabled?: boolean;
  description?: string;
  type?: "file" | "text";
  fileName?: string;
}

interface InsomniaAuth {
  type?: string;
  disabled?: boolean;
  username?: string;
  password?: string;
  token?: string;
  [attrs: string]: unknown;
}

interface InsomniaBody {
  mimeType?: string;
  text?: string;
  params?: InsomniaKeyValue[];
}

interface InsomniaResourceBase {
  _id: string;
  _type: string;
  parentId?: string | null;
}

interface InsomniaWorkspace extends InsomniaResourceBase {
  _type: "workspace";
  name: string;
}

interface InsomniaRequestGroup extends InsomniaResourceBase {
  _type: "request_group";
  name: string;
  description?: string;
  metaSortKey?: number;
}

interface InsomniaRequest extends InsomniaResourceBase {
  _type: "request";
  name: string;
  description?: string;
  method?: string;
  url?: string;
  headers?: InsomniaKeyValue[];
  parameters?: InsomniaKeyValue[];
  authentication?: InsomniaAuth;
  body?: InsomniaBody;
  metaSortKey?: number;
  preRequestScript?: string;
  afterResponseScript?: string;
}

interface InsomniaEnvironment extends InsomniaResourceBase {
  _type: "environment";
  name: string;
  data?: Record<string, unknown>;
}

interface InsomniaCookieJar extends InsomniaResourceBase {
  _type: "cookie_jar";
  name?: string;
  cookies?: unknown[];
}

interface InsomniaApiSpec extends InsomniaResourceBase {
  _type: "api_spec";
  fileName?: string;
  contents?: string;
}

type InsomniaResource =
  | InsomniaWorkspace
  | InsomniaRequestGroup
  | InsomniaRequest
  | InsomniaEnvironment
  | InsomniaCookieJar
  | InsomniaApiSpec
  | (InsomniaResourceBase & Record<string, unknown>);

interface InsomniaExport {
  _type: "export";
  __export_format: number;
  resources: InsomniaResource[];
}

function isInsomniaExport(value: unknown): value is InsomniaExport {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate._type === "export" &&
    typeof candidate.__export_format === "number" &&
    Array.isArray(candidate.resources)
  );
}

/** Nunca lança — usado por `detect` (que precisa devolver só sim/não) e por `parse`. */
function tryParseInsomniaDocument(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    // não é JSON — tenta YAML abaixo.
  }
  try {
    return parseYaml(content);
  } catch {
    return undefined;
  }
}

// ---- Helpers de conversão de valor ----

const TEMPLATE_TAG = /\{%[^%]*%\}/;

/** Tags `{% ... %}` do Insomnia (Nunjucks) não têm equivalente — o valor é mantido como está. */
function reportTemplateTag(
  value: string | undefined,
  path: string,
  notConverted: ImportReportItem[],
): void {
  if (value && TEMPLATE_TAG.test(value)) {
    notConverted.push({
      path,
      reason: `template tag do Insomnia sem equivalente, valor mantido como está: "${value}"`,
    });
  }
}

function splitOnce(text: string, separator: string): [string, string] {
  const index = text.indexOf(separator);
  if (index === -1) return [text, ""];
  return [text.slice(0, index), text.slice(index + separator.length)];
}

function toKeyValue(entry: InsomniaKeyValue): KeyValueEntry {
  return {
    name: entry.name ?? "",
    value: entry.value ?? "",
    enabled: !entry.disabled,
    description: entry.description || undefined,
  };
}

const ABSOLUTE_PATH = /^(\/|[A-Za-z]:[\\/])/;

function mapAuth(
  auth: InsomniaAuth | undefined,
  contextName: string,
  notConverted: ImportReportItem[],
): AuthConfig | undefined {
  if (!auth || !auth.type) return undefined;
  if (auth.disabled) return { type: "none" };

  switch (auth.type) {
    case "none":
      return { type: "none" };
    case "basic":
      return {
        type: "basic",
        basic: { username: auth.username ?? "", password: auth.password ?? "" },
      };
    case "bearer":
      return { type: "bearer", bearer: { token: auth.token ?? "" } };
    default:
      notConverted.push({
        path: `auth de "${contextName}"`,
        reason: `tipo de auth "${auth.type}" sem equivalente no Wttp — configure manualmente`,
      });
      return undefined;
  }
}

function mapBody(
  body: InsomniaBody | undefined,
  contextName: string,
  notConverted: ImportReportItem[],
): RequestBody | undefined {
  if (!body || !body.mimeType) return undefined;

  switch (body.mimeType) {
    case "application/json":
      reportTemplateTag(body.text, `body de "${contextName}"`, notConverted);
      return body.text ? { type: "json", json: body.text } : undefined;
    case "application/x-www-form-urlencoded":
      return { type: "urlencoded", urlencoded: (body.params ?? []).map(toKeyValue) };
    case "multipart/form-data": {
      const multipart: MultipartEntry[] = (body.params ?? []).map(param => {
        if (param.type === "file") {
          const value = param.fileName ?? "";
          if (ABSOLUTE_PATH.test(value)) {
            notConverted.push({
              path: `body de "${contextName}"`,
              reason: `arquivo com caminho absoluto da máquina de origem ("${value}") — ajuste para um caminho relativo ao workspace`,
            });
          }
          return { name: param.name ?? "", type: "file" as const, value, enabled: !param.disabled };
        }
        return {
          name: param.name ?? "",
          type: "text" as const,
          value: param.value ?? "",
          enabled: !param.disabled,
        };
      });
      return { type: "multipart", multipart };
    }
    default:
      reportTemplateTag(body.text, `body de "${contextName}"`, notConverted);
      return body.text ? { type: "raw", raw: body.text, contentType: body.mimeType } : undefined;
  }
}

// ---- Árvore de pastas/requests (parentId → filhos, ordenados por metaSortKey) ----

function isRequestOrGroup(
  resource: InsomniaResource,
): resource is InsomniaRequest | InsomniaRequestGroup {
  return resource._type === "request" || resource._type === "request_group";
}

function sortKey(resource: InsomniaRequest | InsomniaRequestGroup): number {
  return resource.metaSortKey ?? 0;
}

function normalizeRequest(item: InsomniaRequest, notConverted: ImportReportItem[]): NormalizedNode {
  const method = (item.method?.toUpperCase() as HttpMethod | undefined) ?? "GET";
  const headers = (item.headers ?? []).map(toKeyValue);
  headers.forEach(header =>
    reportTemplateTag(header.value, `header "${header.name}" de "${item.name}"`, notConverted),
  );

  const [url, embeddedQueryString] = splitOnce(item.url ?? "", "?");
  reportTemplateTag(url, `url de "${item.name}"`, notConverted);

  const embeddedQuery: KeyValueEntry[] = embeddedQueryString
    ? [...new URLSearchParams(embeddedQueryString).entries()].map(([name, value]) => ({
        name,
        value,
        enabled: true,
      }))
    : [];
  const query = [...embeddedQuery, ...(item.parameters ?? []).map(toKeyValue)];
  query.forEach(param =>
    reportTemplateTag(param.value, `query "${param.name}" de "${item.name}"`, notConverted),
  );

  if (item.preRequestScript || item.afterResponseScript) {
    notConverted.push({
      path: `scripts de "${item.name}"`,
      reason:
        "scripts do Insomnia (insomnia.*) não são convertidos — copie manualmente para pre-request/tests",
    });
  }

  return {
    kind: "request",
    name: item.name,
    method,
    url,
    query: query.length > 0 ? query : undefined,
    headers: headers.length > 0 ? headers : undefined,
    auth: mapAuth(item.authentication, item.name, notConverted),
    body: mapBody(item.body, item.name, notConverted),
    docs: item.description || undefined,
  };
}

function buildChildrenIndex(
  items: Array<InsomniaRequest | InsomniaRequestGroup>,
): Map<string, Array<InsomniaRequest | InsomniaRequestGroup>> {
  const byParent = new Map<string, Array<InsomniaRequest | InsomniaRequestGroup>>();
  for (const item of items) {
    const parentId = item.parentId ?? "";
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(item);
    byParent.set(parentId, siblings);
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => sortKey(a) - sortKey(b));
  return byParent;
}

function buildNode(
  item: InsomniaRequest | InsomniaRequestGroup,
  byParent: Map<string, Array<InsomniaRequest | InsomniaRequestGroup>>,
  notConverted: ImportReportItem[],
): NormalizedNode {
  if (item._type === "request_group") {
    return {
      kind: "folder",
      name: item.name,
      docs: item.description || undefined,
      children: (byParent.get(item._id) ?? []).map(child =>
        buildNode(child, byParent, notConverted),
      ),
    };
  }
  return normalizeRequest(item, notConverted);
}

// ---- Environments — base → sub-environments, herança resolvida por merge de `data` ----

function toEnvironmentVariable(
  key: string,
  value: unknown,
  envName: string,
  notConverted: ImportReportItem[],
): EnvironmentVariable {
  const stringValue = typeof value === "string" ? value : JSON.stringify(value);
  reportTemplateTag(stringValue, `variável "${key}" em "${envName}"`, notConverted);

  const looksLikeSecret = /token|secret|password|api[_-]?key/i.test(key);
  if (looksLikeSecret) {
    notConverted.push({
      path: `variável "${key}" em "${envName}"`,
      reason:
        "nome sugere segredo — marcada secret: true; confirme o valor no environment depois de importar",
    });
  }

  return {
    name: key,
    value: stringValue,
    enabled: true,
    secret: looksLikeSecret || undefined,
  };
}

/**
 * Só ambientes "folha" (sem sub-environment próprio) viram um environment do Wttp — o
 * ambiente base do Insomnia é só um molde de valores compartilhados, nunca ativado
 * sozinho na prática. Cada folha resolve a cadeia inteira até a raiz, valor mais
 * específico (folha) vencendo o mais genérico (base), a mesma regra do próprio
 * Insomnia.
 */
function normalizeEnvironments(
  environments: InsomniaEnvironment[],
  notConverted: ImportReportItem[],
): NormalizedEnvironment[] {
  const byId = new Map(environments.map(env => [env._id, env]));
  const parentsWithChild = new Set(
    environments
      .filter(env => env.parentId !== undefined && env.parentId !== null && byId.has(env.parentId))
      .map(env => env.parentId as string),
  );
  const leaves = environments.filter(env => !parentsWithChild.has(env._id));

  return leaves.map(leaf => {
    const chain: InsomniaEnvironment[] = [];
    let current: InsomniaEnvironment | undefined = leaf;
    while (current) {
      chain.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }

    const merged: Record<string, unknown> = {};
    for (const env of chain) Object.assign(merged, env.data ?? {});

    const variables = Object.entries(merged).map(([key, value]) =>
      toEnvironmentVariable(key, value, leaf.name, notConverted),
    );
    return { name: leaf.name, variables };
  });
}

// ---- Recursos sem equivalente que podem carregar informação real ----

function reportUnsupportedExtras(
  resources: InsomniaResource[],
  notConverted: ImportReportItem[],
): void {
  for (const resource of resources) {
    if (resource._type === "cookie_jar") {
      const jar = resource as InsomniaCookieJar;
      if (Array.isArray(jar.cookies) && jar.cookies.length > 0) {
        notConverted.push({
          path: `cookie jar "${jar.name ?? jar._id}"`,
          reason: "cookies não são suportados pelo Wttp — configure manualmente se necessário",
        });
      }
    }
    if (resource._type === "api_spec") {
      const spec = resource as InsomniaApiSpec;
      if (typeof spec.contents === "string" && spec.contents.trim() !== "") {
        notConverted.push({
          path: `spec anexada "${spec.fileName ?? spec._id}"`,
          reason:
            "spec OpenAPI anexada ao workspace do Insomnia não é importada por aqui — use o importador OpenAPI (EP-08-T04) separadamente",
        });
      }
    }
  }
}

function normalizeInsomnia(doc: InsomniaExport): NormalizedImport {
  const notConverted: ImportReportItem[] = [];
  const resources = doc.resources ?? [];

  const workspaces = resources.filter(
    (resource): resource is InsomniaWorkspace => resource._type === "workspace",
  );
  const workspaceIds = new Set(workspaces.map(workspace => workspace._id));
  const name = workspaces.length === 1 ? workspaces[0].name : "Insomnia import";

  const groupsAndRequests = resources.filter(isRequestOrGroup);
  const byParent = buildChildrenIndex(groupsAndRequests);

  const rootItems = groupsAndRequests
    .filter(item => workspaceIds.has(item.parentId ?? ""))
    .sort((a, b) => sortKey(a) - sortKey(b));
  const children = rootItems.map(item => buildNode(item, byParent, notConverted));

  const environments = normalizeEnvironments(
    resources.filter(
      (resource): resource is InsomniaEnvironment => resource._type === "environment",
    ),
    notConverted,
  );

  reportUnsupportedExtras(resources, notConverted);

  return { name, children, environments, notConverted };
}

export const insomniaImporter: Importer = {
  format: "insomnia",
  detect: content => {
    const doc = tryParseInsomniaDocument(content);
    return doc !== undefined && isInsomniaExport(doc);
  },
  parse: content => {
    const doc = tryParseInsomniaDocument(content);
    if (!isInsomniaExport(doc)) throw new Error("not a recognizable Insomnia v4 export");
    return doc;
  },
  normalize: parsed => normalizeInsomnia(parsed as InsomniaExport),
};

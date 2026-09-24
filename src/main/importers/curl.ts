/**
 * Importador de cURL (EP-08-T05). Ao contrário dos outros formatos, cURL também
 * alimenta um segundo caminho fora do pipeline `import:run`: colar na barra de URL
 * preenche a aba ativa direto (`parseCurlToRequest`, via canal `import:parseCurl`),
 * sem passar pela árvore do workspace — por isso a lógica de parsing fica separada da
 * montagem de `NormalizedImport`.
 */

import type {
  AuthConfig,
  HttpMethod,
  ImportReportItem,
  KeyValueEntry,
  MultipartEntry,
  ParsedCurlRequest,
  RequestBody,
} from "@shared";

import type { Importer, NormalizedImport } from "./types";

const CURL_PREFIX = /^\s*curl(\.exe)?\s/i;

/** Heurística de detecção — nunca lança, só diz sim ou não. */
export function looksLikeCurlCommand(content: string): boolean {
  return CURL_PREFIX.test(content);
}

/**
 * Tokeniza um comando de shell: aspas simples (literais), aspas duplas (com escape de
 * `\"`, `\\`, `\$`, `` \` ``) e `\` fora de aspas escapando o próximo caractere.
 * Continuação de linha (`\` no fim da linha) é resolvida antes, juntando as linhas.
 */
export function tokenizeShellCommand(command: string): string[] {
  const joined = command.replace(/\\\r?\n[ \t]*/g, " ");
  const tokens: string[] = [];
  let current = "";
  let hasCurrent = false;
  let i = 0;

  while (i < joined.length) {
    const char = joined[i];

    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      if (hasCurrent) {
        tokens.push(current);
        current = "";
        hasCurrent = false;
      }
      i += 1;
      continue;
    }

    if (char === "'") {
      hasCurrent = true;
      i += 1;
      while (i < joined.length && joined[i] !== "'") {
        current += joined[i];
        i += 1;
      }
      i += 1;
      continue;
    }

    if (char === '"') {
      hasCurrent = true;
      i += 1;
      while (i < joined.length && joined[i] !== '"') {
        if (joined[i] === "\\" && i + 1 < joined.length && '"\\$`'.includes(joined[i + 1])) {
          current += joined[i + 1];
          i += 2;
        } else {
          current += joined[i];
          i += 1;
        }
      }
      i += 1;
      continue;
    }

    if (char === "\\" && i + 1 < joined.length) {
      current += joined[i + 1];
      hasCurrent = true;
      i += 2;
      continue;
    }

    current += char;
    hasCurrent = true;
    i += 1;
  }

  if (hasCurrent) tokens.push(current);
  return tokens;
}

const VALUE_FLAGS: Record<string, string> = {
  "-X": "method",
  "--request": "method",
  "-H": "header",
  "--header": "header",
  "-d": "data",
  "--data": "data",
  "--data-raw": "data",
  "--data-binary": "data-binary",
  "--data-ascii": "data",
  "--data-urlencode": "data-urlencode",
  "-F": "form",
  "--form": "form",
  // Emitido pelo "Copy as cURL" do próprio Wttp (#44) para campos de texto — o valor é
  // sempre literal, nunca leitura de arquivo.
  "--form-string": "form-string",
  "-u": "user",
  "--user": "user",
  "--url": "url",
  "-b": "cookie",
  "--cookie": "cookie",
};

const BOOLEAN_FLAGS: Record<string, string> = {
  "-k": "insecure",
  "--insecure": "insecure",
  "-I": "head",
  "--head": "head",
  "-g": "noop",
  "--globoff": "noop",
  "-L": "location",
  "--location": "location",
  "--compressed": "compressed",
  "-s": "noop",
  "--silent": "noop",
  "-S": "noop",
  "--show-error": "noop",
  "-v": "noop",
  "--verbose": "noop",
  "-i": "noop",
  "--include": "noop",
  "-G": "noop",
  "--get": "noop",
};

function splitOnce(text: string, separator: string): [string, string] {
  const index = text.indexOf(separator);
  if (index === -1) return [text, ""];
  return [text.slice(0, index), text.slice(index + separator.length)];
}

/**
 * Caminho de `-F name=@path[;type=...]`. Entre aspas duplas (`@"/a;b.txt"`, com `\"` e
 * `\\` escapados), o caminho pode conter `;`/`,` — é como o `curl` aceita esses
 * caracteres, e como o "Copy as cURL" do Wttp (#44) os emite.
 */
function formFilePath(spec: string): string {
  if (!spec.startsWith('"')) return spec.split(";")[0];
  let path = "";
  for (let i = 1; i < spec.length; i += 1) {
    const char = spec[i];
    if (char === "\\" && i + 1 < spec.length) {
      path += spec[i + 1];
      i += 1;
    } else if (char === '"') {
      break;
    } else {
      path += char;
    }
  }
  return path;
}

export function parseCurlCommand(command: string): ParsedCurlRequest {
  const tokens = tokenizeShellCommand(command);
  const notConverted: ImportReportItem[] = [];

  let explicitMethod: HttpMethod | undefined;
  let url = "";
  let hasUrl = false;
  const headers: KeyValueEntry[] = [];
  const dataParts: string[] = [];
  const multipart: MultipartEntry[] = [];
  let hasData = false;
  let isMultipart = false;
  let binaryFile: string | undefined;
  let isHead = false;
  let auth: AuthConfig | undefined;
  let validateTls: boolean | undefined;
  let followRedirects: boolean | undefined;

  let i = tokens[0]?.toLowerCase() === "curl" ? 1 : 0;

  while (i < tokens.length) {
    const token = tokens[i];

    const valueKind = VALUE_FLAGS[token];
    if (valueKind) {
      const value = tokens[i + 1] ?? "";
      i += 2;

      switch (valueKind) {
        case "method":
          explicitMethod = value.toUpperCase() as HttpMethod;
          break;
        case "header": {
          // `Nome;` é a sintaxe do curl para mandar o header com valor vazio.
          if (!value.includes(":") && value.trim().endsWith(";")) {
            headers.push({ name: value.trim().slice(0, -1).trim(), value: "", enabled: true });
            break;
          }
          const [name, rest] = splitOnce(value, ":");
          if (rest === "" && !value.includes(":")) {
            notConverted.push({ path: `header "${value}"`, reason: 'sem ":" — ignorado' });
          } else {
            headers.push({ name: name.trim(), value: rest.trim(), enabled: true });
          }
          break;
        }
        case "data":
          dataParts.push(value);
          hasData = true;
          break;
        case "data-binary":
          // `--data-binary @arquivo` manda o arquivo como está — o body `binary` do Wttp.
          if (value.startsWith("@")) binaryFile = value.slice(1);
          else dataParts.push(value);
          hasData = true;
          break;
        case "data-urlencode": {
          const [name, rest] = splitOnce(value, "=");
          dataParts.push(rest ? `${name}=${encodeURIComponent(rest)}` : encodeURIComponent(name));
          hasData = true;
          break;
        }
        case "form": {
          const [name, rest] = splitOnce(value, "=");
          if (rest.startsWith("@")) {
            multipart.push({
              name,
              type: "file",
              value: formFilePath(rest.slice(1)),
              enabled: true,
            });
          } else {
            multipart.push({ name, type: "text", value: rest, enabled: true });
          }
          isMultipart = true;
          break;
        }
        case "form-string": {
          const [name, rest] = splitOnce(value, "=");
          multipart.push({ name, type: "text", value: rest, enabled: true });
          isMultipart = true;
          break;
        }
        case "user": {
          const [username, password] = splitOnce(value, ":");
          auth = { type: "basic", basic: { username, password } };
          break;
        }
        case "url":
          url = value;
          hasUrl = true;
          break;
        case "cookie":
          notConverted.push({
            path: `-b/--cookie "${value}"`,
            reason: "sem equivalente — adicione manualmente",
          });
          break;
      }
      continue;
    }

    const booleanKind = BOOLEAN_FLAGS[token];
    if (booleanKind) {
      if (booleanKind === "insecure") validateTls = false;
      if (booleanKind === "location") followRedirects = true;
      if (booleanKind === "head") isHead = true;
      i += 1;
      continue;
    }

    if (token.startsWith("-")) {
      notConverted.push({ path: `flag "${token}"`, reason: "flag não suportada — ignorada" });
      i += 1;
      continue;
    }

    if (!hasUrl) {
      url = token;
      hasUrl = true;
    } else {
      notConverted.push({ path: `argumento "${token}"`, reason: "argumento extra ignorado" });
    }
    i += 1;
  }

  const [basePath, queryString] = splitOnce(url, "?");
  const query: KeyValueEntry[] = queryString
    ? [...new URLSearchParams(queryString).entries()].map(([name, value]) => ({
        name,
        value,
        enabled: true,
      }))
    : [];

  const method: HttpMethod =
    explicitMethod ?? (isHead ? "HEAD" : isMultipart || hasData ? "POST" : "GET");
  const body: RequestBody | undefined =
    binaryFile !== undefined
      ? { type: "binary", binary: binaryFile }
      : buildBody({ isMultipart, multipart, hasData, dataParts, headers });

  const settings =
    validateTls !== undefined || followRedirects !== undefined
      ? { validateTls, followRedirects }
      : undefined;

  return { method, url: basePath, query, headers, auth, body, settings, notConverted };
}

function buildBody(input: {
  isMultipart: boolean;
  multipart: MultipartEntry[];
  hasData: boolean;
  dataParts: string[];
  headers: KeyValueEntry[];
}): RequestBody | undefined {
  if (input.isMultipart) return { type: "multipart", multipart: input.multipart };
  if (!input.hasData) return undefined;

  const raw = input.dataParts.join("&");
  const contentTypeHeader = input.headers.find(
    header => header.name.toLowerCase() === "content-type",
  );
  const contentType = contentTypeHeader?.value;

  const looksJson = (contentType?.includes("json") ?? false) || isJsonLike(raw);
  if (looksJson) return { type: "json", json: raw };

  if (!contentType || contentType.includes("x-www-form-urlencoded")) {
    return {
      type: "urlencoded",
      urlencoded: [...new URLSearchParams(raw).entries()].map(([name, value]) => ({
        name,
        value,
        enabled: true,
      })),
    };
  }

  return { type: "raw", raw, contentType };
}

function isJsonLike(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/** Usado pelo canal `import:parseCurl` — `null` quando o conteúdo não parece cURL. */
export function parseCurlToRequest(content: string): ParsedCurlRequest | null {
  if (!looksLikeCurlCommand(content)) return null;
  return parseCurlCommand(content);
}

function nameFromUrl(url: string, method: HttpMethod): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${method} ${parsed.host}${path}`;
  } catch {
    return `${method} ${url}`;
  }
}

export const curlImporter: Importer = {
  format: "curl",
  detect: content => looksLikeCurlCommand(content),
  parse: content => parseCurlCommand(content),
  normalize: parsed => {
    const request = parsed as ParsedCurlRequest;
    const normalized: NormalizedImport = {
      name: "cURL import",
      children: [
        {
          kind: "request",
          name: nameFromUrl(request.url, request.method),
          method: request.method,
          url: request.url,
          query: request.query,
          headers: request.headers,
          auth: request.auth,
          body: request.body,
        },
      ],
      environments: [],
      notConverted: request.notConverted,
    };
    return normalized;
  },
};

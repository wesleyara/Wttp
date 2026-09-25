/**
 * Entrada comum dos geradores de snippet (ClickLocal #46): a request **já resolvida** (mesma
 * entrada e mesma regra de máscara do "Copy as cURL", #44) reduzida ao que toda linguagem
 * precisa — URL final, headers, auth Basic à parte, e um corpo normalizado. Espelha as
 * regras da engine como `curl.ts` faz: query da tabela é a fonte, `Authorization` manual
 * vence bearer/basic, e o `Content-Type` padrão de cada tipo de corpo entra sozinho.
 */

import type { HttpMethod, KeyValueEntry } from "@shared";

import {
  buildUrl,
  type CurlOptions,
  type CurlRequest,
  hasEnabledHeader,
  maskAuth,
  maskBody,
  maskEntries,
  maskText,
} from "./curl";

export type CodegenRequest = CurlRequest;
export type CodegenOptions = CurlOptions;

export interface MultipartField {
  name: string;
  type: "text" | "file";
  value: string;
}

export type NormalizedBody =
  | { type: "none" }
  /** JSON e raw — os bytes exatos que a engine mandaria. */
  | { type: "text"; text: string }
  | { type: "urlencoded"; fields: [string, string][] }
  | { type: "multipart"; fields: MultipartField[] }
  | { type: "binary"; path: string };

export interface NormalizedRequest {
  method: HttpMethod;
  /** URL final, com a query da tabela já anexada. */
  url: string;
  headers: [name: string, value: string][];
  /** Basic fica separado: cada linguagem tem a sua forma nativa (`SetBasicAuth`, `auth=`, `--auth`). */
  basic?: { username: string; password: string };
  body: NormalizedBody;
}

function normalizeBody(body: ReturnType<typeof maskBody>): NormalizedBody {
  switch (body.type) {
    case "none":
      return { type: "none" };
    case "json":
      return { type: "text", text: body.json };
    case "raw":
      return { type: "text", text: body.raw };
    case "urlencoded":
      return {
        type: "urlencoded",
        fields: body.urlencoded.filter(e => e.enabled).map(e => [e.name, e.value]),
      };
    case "multipart":
      return {
        type: "multipart",
        fields: body.multipart
          .filter(e => e.enabled)
          .map(e => ({ name: e.name, type: e.type, value: e.value })),
      };
    case "binary":
      return { type: "binary", path: body.binary };
  }
}

/** `Content-Type` que a engine adiciona sozinha quando o usuário não definiu um. */
function defaultContentType(body: NormalizedBody, raw: string | undefined): string | undefined {
  switch (body.type) {
    case "text":
      return raw;
    case "binary":
      return "application/octet-stream";
    default:
      return undefined;
  }
}

export function normalizeRequest(
  request: CodegenRequest,
  options: CodegenOptions = {},
): NormalizedRequest {
  const mask = options.maskSecrets ?? true;
  const secrets = mask
    ? [...new Set(options.secrets ?? [])]
        .filter(secret => secret.length > 0)
        .sort((a, b) => b.length - a.length)
    : [];

  const entries: KeyValueEntry[] = mask ? maskEntries(request.headers, secrets) : request.headers;
  const query: KeyValueEntry[] = mask ? maskEntries(request.query, secrets) : [...request.query];
  const maskedBody = mask ? maskBody(request.body, secrets) : request.body;
  const auth = mask ? maskAuth(request.auth, secrets) : request.auth;
  const url = mask ? maskText(request.url, secrets) : request.url;

  const headers: [string, string][] = entries
    .filter(entry => entry.enabled)
    .map(entry => [entry.name, entry.value]);
  let basic: NormalizedRequest["basic"];

  const manualAuthorization = hasEnabledHeader(entries, "authorization");
  switch (auth.type) {
    case "bearer":
      if (!manualAuthorization && auth.bearer.token) {
        headers.push(["Authorization", `Bearer ${auth.bearer.token}`]);
      }
      break;
    case "basic":
      if (!manualAuthorization && (auth.basic.username || auth.basic.password)) {
        basic = { username: auth.basic.username, password: auth.basic.password };
      }
      break;
    case "apikey":
      if (auth.apikey.key) {
        if (auth.apikey.in === "query") {
          query.push({ name: auth.apikey.key, value: auth.apikey.value, enabled: true });
        } else {
          headers.push([auth.apikey.key, auth.apikey.value]);
        }
      }
      break;
    default:
      break;
  }

  const body = normalizeBody(maskedBody);
  const contentType = defaultContentType(
    body,
    request.body.type === "raw" ? request.body.contentType : "application/json",
  );
  if (contentType && !hasEnabledHeader(entries, "content-type")) {
    headers.push(["Content-Type", contentType]);
  }

  return { method: request.method, url: buildUrl(url, query), headers, basic, body };
}

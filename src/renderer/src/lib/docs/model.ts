/**
 * Modelo de leitura da documentação (EP-12-T02/T03): a árvore de uma collection/pasta
 * reduzida ao que um leitor precisa — assinatura de cada request (método, URL, params),
 * o `docs` markdown e snippets de exemplo. Puro, sem I/O: alimenta o painel de leitura
 * e os dois exports (HTML/markdown) a partir da mesma fonte.
 *
 * Segredos: nenhum valor de environment entra aqui (as `{{variáveis}}` ficam como
 * referência) e valores literais de auth/headers sensíveis são mascarados — a mesma regra
 * vale para a tela e para o arquivo exportado.
 */

import type {
  AuthConfig,
  FolderNode,
  HttpMethod,
  KeyValueEntry,
  RequestBody,
  RequestFile,
  WorkspaceNode,
} from "@shared";

import { type CodegenLanguage, generateCode } from "@renderer/lib/codegen";
import { SECRET_MASK } from "@renderer/lib/codegen/curl";

/** Linguagens dos exemplos nos docs (EP-12-T03: cURL, fetch, axios). */
export const DOCS_SNIPPET_LANGUAGES: readonly CodegenLanguage[] = ["curl", "fetch", "axios"];

export const DOCS_SNIPPET_LABELS: Record<string, string> = {
  curl: "cURL",
  fetch: "fetch",
  axios: "axios",
};

export interface DocsRequest {
  kind: "request";
  /** Id estável e seguro para âncora/`id` de elemento, derivado do `path`. */
  anchor: string;
  path: string;
  name: string;
  method: HttpMethod;
  url: string;
  docs: string;
  pathParams: KeyValueEntry[];
  query: KeyValueEntry[];
  headers: KeyValueEntry[];
  auth: AuthConfig | undefined;
  /** Auth que de fato vale: a própria, ou a da primeira pasta/collection acima que não seja `inherit`. Nunca `inherit`. */
  effectiveAuth: AuthConfig;
  /** `true` quando `effectiveAuth` veio de uma pasta/collection, não da própria request. */
  authInherited: boolean;
  body: RequestBody;
}

export interface DocsFolder {
  kind: "folder";
  anchor: string;
  path: string;
  name: string;
  docs: string;
  children: DocsItem[];
}

export type DocsItem = DocsFolder | DocsRequest;

export interface FlatDocsItem {
  item: DocsItem;
  depth: number;
}

const VARIABLE_ONLY = /^\{\{\s*[^{}\s]+\s*\}\}$/;
const SENSITIVE_HEADER =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token)$|token|secret|password|api[-_]?key/i;

export function anchorFor(path: string): string {
  return `doc-${path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "root"}`;
}

/** Referência pura `{{var}}` é segura para mostrar; qualquer outro valor literal em campo sensível é mascarado. */
function redactValue(value: string): string {
  if (!value || VARIABLE_ONLY.test(value.trim())) return value;
  return SECRET_MASK;
}

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADER.test(name.trim());
}

export function redactHeaders(headers: KeyValueEntry[]): KeyValueEntry[] {
  return headers.map(header =>
    isSensitiveHeader(header.name) ? { ...header, value: redactValue(header.value) } : header,
  );
}

export function redactAuth(auth: AuthConfig | undefined): AuthConfig {
  if (!auth) return { type: "none" };
  switch (auth.type) {
    case "bearer":
      return { type: "bearer", bearer: { token: redactValue(auth.bearer.token) } };
    case "basic":
      return {
        type: "basic",
        basic: {
          username: auth.basic.username,
          password: redactValue(auth.basic.password),
        },
      };
    case "apikey":
      return {
        type: "apikey",
        apikey: { ...auth.apikey, value: redactValue(auth.apikey.value) },
      };
    default:
      return auth;
  }
}

/** Mesma regra de `resolveAuthChain` (main/http/authInheritance.ts): a primeira camada que não seja `inherit` vence; nada em lugar nenhum é "sem auth". */
function resolveEffectiveAuth(chain: (AuthConfig | undefined)[]): {
  auth: AuthConfig;
  inherited: boolean;
} {
  for (let index = 0; index < chain.length; index++) {
    const auth = chain[index];
    if (!auth || auth.type === "inherit") continue;
    return { auth, inherited: index > 0 };
  }
  return { auth: { type: "none" }, inherited: false };
}

function toRequest(
  node: { path: string; name: string; data: RequestFile },
  folderAuth: (AuthConfig | undefined)[],
): DocsRequest {
  const { data } = node;
  const effective = resolveEffectiveAuth([data.auth, ...folderAuth]);
  return {
    kind: "request",
    anchor: anchorFor(node.path),
    path: node.path,
    name: data.name || node.name,
    method: data.method,
    url: data.url,
    docs: data.docs ?? "",
    pathParams: data.pathParams ?? [],
    query: data.query ?? [],
    headers: data.headers ?? [],
    auth: data.auth,
    effectiveAuth: effective.auth,
    authInherited: effective.inherited,
    body: data.body ?? { type: "none" },
  };
}

function toItems(nodes: WorkspaceNode[], folderAuth: (AuthConfig | undefined)[]): DocsItem[] {
  const items: DocsItem[] = [];
  for (const node of nodes) {
    if (node.kind === "folder") items.push(toFolder(node, folderAuth));
    // Request com YAML inválido (`data: null`) não tem o que documentar.
    else if (node.data)
      items.push(toRequest({ path: node.path, name: node.name, data: node.data }, folderAuth));
  }
  return items;
}

/** `folderAuth`: `auth` das pastas acima de `node`, a mais próxima primeiro. */
export function toFolder(
  node: FolderNode,
  folderAuth: (AuthConfig | undefined)[] = [],
): DocsFolder {
  return {
    kind: "folder",
    anchor: anchorFor(node.path),
    path: node.path,
    name: node.data?.name || node.name,
    docs: node.data?.docs ?? "",
    children: toItems(node.children, [node.data?.auth, ...folderAuth]),
  };
}

/**
 * Documentação de uma collection/pasta: a pasta primeiro, depois seus filhos na ordem da
 * árvore. `ancestorAuth` são os `auth` das pastas acima da raiz do modelo (mais próxima
 * primeiro) — vazio para uma collection.
 */
export function buildDocsModel(
  folder: FolderNode,
  ancestorAuth: (AuthConfig | undefined)[] = [],
): DocsFolder {
  return toFolder(folder, ancestorAuth);
}

/** Resumo de uma `AuthConfig` já mascarada (`redactAuth`) para leitura — nunca um valor literal secreto. */
export function authFields(auth: AuthConfig): { type: string; fields: [string, string][] } {
  switch (auth.type) {
    case "bearer":
      return { type: "Bearer", fields: [["token", auth.bearer.token]] };
    case "basic":
      return {
        type: "Basic",
        fields: [
          ["username", auth.basic.username],
          ["password", auth.basic.password],
        ],
      };
    case "apikey":
      return {
        type: "API key",
        fields: [
          ["key", auth.apikey.key],
          ["value", auth.apikey.value],
          ["in", auth.apikey.in],
        ],
      };
    default:
      return { type: "None", fields: [] };
  }
}

/** Corpo legível para leitura; `null` quando não há body (seção omitida). Binário/multipart viram descrição, nunca conteúdo. */
export function describeBody(
  body: RequestBody,
): { language: "json" | "text"; text: string } | null {
  switch (body.type) {
    case "none":
      return null;
    case "json":
      return body.json.trim() ? { language: "json", text: body.json } : null;
    case "raw":
      return body.raw.trim() ? { language: "text", text: body.raw } : null;
    case "urlencoded": {
      const rows = enabledEntries(body.urlencoded);
      return rows.length
        ? { language: "text", text: rows.map(row => `${row.name}=${row.value}`).join("\n") }
        : null;
    }
    case "multipart": {
      const rows = body.multipart.filter(row => row.enabled && row.name.trim() !== "");
      return rows.length
        ? {
            language: "text",
            text: rows
              .map(row => `${row.name}=${row.type === "file" ? `@${row.value}` : row.value}`)
              .join("\n"),
          }
        : null;
    }
    case "binary":
      return body.binary ? { language: "text", text: body.binary } : null;
  }
}

export function flattenDocs(root: DocsFolder): FlatDocsItem[] {
  const result: FlatDocsItem[] = [];
  const visit = (item: DocsItem, depth: number): void => {
    result.push({ item, depth });
    if (item.kind === "folder") for (const child of item.children) visit(child, depth + 1);
  };
  visit(root, 0);
  return result;
}

export function countRequests(root: DocsFolder): number {
  return flattenDocs(root).filter(entry => entry.item.kind === "request").length;
}

/** Entradas de query/params/headers ligadas — o que entra na assinatura. */
export function enabledEntries(entries: KeyValueEntry[]): KeyValueEntry[] {
  return entries.filter(entry => entry.enabled && entry.name.trim() !== "");
}

/** Snippet de exemplo da request como escrita (variáveis intactas, segredos mascarados). */
export function requestSnippet(request: DocsRequest, language: CodegenLanguage): string {
  return generateCode(
    language,
    {
      method: request.method,
      url: request.url,
      query: request.query,
      headers: redactHeaders(request.headers),
      auth: redactAuth(request.auth),
      body: request.body,
    },
    { maskSecrets: false },
  );
}

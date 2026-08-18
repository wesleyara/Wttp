/**
 * Resolvedor de `{{variável}}` (EP-06-T01) — docs/file-format.md §8.
 *
 * Módulo puro, sem `node:*`/`electron`: só manipula strings e os tipos de
 * `@shared`. Precedência de definição: `runtime > environment > collection/pasta >
 * workspace > dinâmicas` — a primeira camada que define um nome vence, mesmo que uma
 * camada de menor precedência também o defina.
 *
 * A resolução é recursiva (o valor de uma variável pode conter `{{outra}}`) com
 * detecção de ciclo, e nunca troca uma variável não resolvida por string vazia — o
 * placeholder original é preservado no texto de saída e o nome entra em `unresolved`
 * para quem chamou decidir o que fazer.
 */

import type { AuthConfig, KeyValueEntry, MultipartEntry, RequestBody } from "@shared";

export type VariableSource = "runtime" | "environment" | "collection" | "workspace" | "dynamic";

export interface ResolvedVariable {
  name: string;
  value: string;
  source: VariableSource;
}

/**
 * Cada camada já vem pronta para o resolvedor: `runtime` é um mapa simples
 * (`wttp.setVar`), as demais são listas de `KeyValueEntry` — entradas com
 * `enabled: false` são ignoradas. `collection` é o merge da cadeia de pastas até a
 * raiz, pasta mais próxima da request já vencendo as mais distantes (quem monta o
 * merge é o chamador, não este módulo).
 */
export interface VariableScope {
  runtime?: Record<string, string>;
  environment?: KeyValueEntry[];
  collection?: KeyValueEntry[];
  workspace?: KeyValueEntry[];
}

export interface ResolveTextResult {
  value: string;
  /** Nomes referenciados que não puderam ser resolvidos — inclui os presos em ciclo. */
  unresolved: string[];
  /** Variáveis efetivamente usadas nesta resolução, com a camada de origem (para tooltip, EP-06-T05). */
  used: ResolvedVariable[];
  /** Cada ciclo encontrado, como o caminho de nomes que fecha o laço (ex. `["a", "b", "a"]`). */
  cycles: string[][];
}

const DYNAMIC_GENERATORS: Record<string, () => string> = {
  $uuid: () => cryptoRandomUuid(),
  $timestamp: () => String(Math.floor(Date.now() / 1000)),
  $isoTimestamp: () => new Date().toISOString(),
  $randomInt: () => String(Math.floor(Math.random() * 1001)),
};

function cryptoRandomUuid(): string {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();

  // Fallback só para runtimes sem `crypto.randomUUID` global — não é o caminho comum.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/** `\{{nome}}` escapa a sintaxe — vira `{{nome}}` literal, nunca resolvido como variável. */
const VAR_PATTERN = /(\\)?\{\{\s*([^{}]+?)\s*\}\}/g;

function enabledEntries(entries: KeyValueEntry[] | undefined): KeyValueEntry[] {
  return (entries ?? []).filter(entry => entry.enabled);
}

function buildVariableMap(scope: VariableScope): Map<string, ResolvedVariable> {
  const layers: { source: VariableSource; entries: KeyValueEntry[] }[] = [
    {
      source: "runtime",
      entries: Object.entries(scope.runtime ?? {}).map(([name, value]) => ({
        name,
        value,
        enabled: true,
      })),
    },
    { source: "environment", entries: enabledEntries(scope.environment) },
    { source: "collection", entries: enabledEntries(scope.collection) },
    { source: "workspace", entries: enabledEntries(scope.workspace) },
  ];

  const map = new Map<string, ResolvedVariable>();
  for (const layer of layers) {
    for (const entry of layer.entries) {
      if (!map.has(entry.name))
        map.set(entry.name, { name: entry.name, value: entry.value, source: layer.source });
    }
  }
  return map;
}

/** Estado compartilhado por todas as strings resolvidas numa mesma chamada — mantém `{{$uuid}}` consistente dentro da mesma request e detecta ciclos entre campos diferentes. */
interface ResolveContext {
  memo: Map<string, string>;
  resolving: Set<string>;
  unresolved: Set<string>;
  used: Map<string, ResolvedVariable>;
  cycles: string[][];
}

function createContext(): ResolveContext {
  return {
    memo: new Map(),
    resolving: new Set(),
    unresolved: new Set(),
    used: new Map(),
    cycles: [],
  };
}

/** Resolve um único nome, recursivamente, memoizando o resultado em `ctx`. `null` = não resolvido (ausente ou ciclo). */
function resolveName(
  name: string,
  map: Map<string, ResolvedVariable>,
  ctx: ResolveContext,
): string | null {
  if (ctx.memo.has(name)) return ctx.memo.get(name) as string;

  if (ctx.resolving.has(name)) {
    ctx.cycles.push([...ctx.resolving, name]);
    ctx.unresolved.add(name);
    return null;
  }

  const entry = map.get(name);
  let source: VariableSource;
  let rawValue: string;

  if (entry) {
    source = entry.source;
    rawValue = entry.value;
  } else if (name in DYNAMIC_GENERATORS) {
    source = "dynamic";
    rawValue = DYNAMIC_GENERATORS[name]();
  } else {
    ctx.unresolved.add(name);
    return null;
  }

  ctx.resolving.add(name);
  const resolvedValue = substitute(rawValue, map, ctx);
  ctx.resolving.delete(name);

  ctx.memo.set(name, resolvedValue);
  ctx.used.set(name, { name, value: resolvedValue, source });
  return resolvedValue;
}

function substitute(text: string, map: Map<string, ResolvedVariable>, ctx: ResolveContext): string {
  return text.replace(VAR_PATTERN, (match, escape: string | undefined, rawName: string) => {
    if (escape) return `{{${rawName}}}`;

    const resolved = resolveName(rawName.trim(), map, ctx);
    return resolved === null ? match : resolved;
  });
}

function finish(value: string, ctx: ResolveContext): ResolveTextResult {
  return {
    value,
    unresolved: [...ctx.unresolved],
    used: [...ctx.used.values()],
    cycles: ctx.cycles,
  };
}

/** Resolve um único texto (URL, um header, o body como string, etc). */
export function resolveText(template: string, scope: VariableScope): ResolveTextResult {
  const map = buildVariableMap(scope);
  const ctx = createContext();
  return finish(substitute(template, map, ctx), ctx);
}

export interface ResolveRequestInput {
  url: string;
  /** Valor de cada segmento `:nome` na URL — consumidos na própria URL, não sobram no resultado (EP-06.1). */
  pathParams?: KeyValueEntry[];
  query: KeyValueEntry[];
  headers: KeyValueEntry[];
  auth: AuthConfig;
  body: RequestBody;
}

export interface ResolveRequestResult {
  url: string;
  query: KeyValueEntry[];
  headers: KeyValueEntry[];
  auth: AuthConfig;
  body: RequestBody;
  unresolved: string[];
  used: ResolvedVariable[];
  cycles: string[][];
}

/** `:nome` — mesmo padrão usado no parser da UI (`url-path-params-sync.ts`). */
const PATH_PARAM_PATTERN = /:([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Troca cada `:nome` da URL pelo valor do pathParam habilitado de mesmo nome, resolvendo
 * `{{var}}` dentro desse valor primeiro. `:nome` sem pathParam correspondente (ou
 * desabilitado) fica intacto — mesmo comportamento de hoje, texto inerte.
 */
function substitutePathParams(
  url: string,
  pathParams: KeyValueEntry[],
  map: Map<string, ResolvedVariable>,
  ctx: ResolveContext,
): string {
  const values = new Map(
    pathParams
      .filter(param => param.enabled && param.name !== "")
      .map(param => [param.name, param.value]),
  );
  return url.replace(PATH_PARAM_PATTERN, (match, name: string) => {
    const value = values.get(name);
    if (value === undefined) return match;
    return encodeURIComponent(substitute(value, map, ctx));
  });
}

function resolveEntries(
  entries: KeyValueEntry[],
  map: Map<string, ResolvedVariable>,
  ctx: ResolveContext,
): KeyValueEntry[] {
  return entries.map(entry => ({ ...entry, value: substitute(entry.value, map, ctx) }));
}

function resolveMultipart(
  entries: MultipartEntry[],
  map: Map<string, ResolvedVariable>,
  ctx: ResolveContext,
): MultipartEntry[] {
  return entries.map(entry => ({ ...entry, value: substitute(entry.value, map, ctx) }));
}

function resolveBody(
  body: RequestBody,
  map: Map<string, ResolvedVariable>,
  ctx: ResolveContext,
): RequestBody {
  switch (body.type) {
    case "none":
      return body;
    case "json":
      return { ...body, json: substitute(body.json, map, ctx) };
    case "urlencoded":
      return { ...body, urlencoded: resolveEntries(body.urlencoded, map, ctx) };
    case "raw":
      return { ...body, raw: substitute(body.raw, map, ctx) };
    case "multipart":
      return { ...body, multipart: resolveMultipart(body.multipart, map, ctx) };
    case "binary":
      return { ...body, binary: substitute(body.binary, map, ctx) };
  }
}

function resolveAuth(
  auth: AuthConfig,
  map: Map<string, ResolvedVariable>,
  ctx: ResolveContext,
): AuthConfig {
  switch (auth.type) {
    case "none":
    case "inherit":
      return auth;
    case "bearer":
      return { ...auth, bearer: { token: substitute(auth.bearer.token, map, ctx) } };
    case "basic":
      return {
        ...auth,
        basic: {
          username: substitute(auth.basic.username, map, ctx),
          password: substitute(auth.basic.password, map, ctx),
        },
      };
    case "apikey":
      return {
        ...auth,
        apikey: {
          key: substitute(auth.apikey.key, map, ctx),
          value: substitute(auth.apikey.value, map, ctx),
          in: auth.apikey.in,
        },
      };
  }
}

/** Resolve a request inteira — URL, query, headers, auth e body — com um único ciclo de detecção compartilhado. */
export function resolveRequest(
  input: ResolveRequestInput,
  scope: VariableScope,
): ResolveRequestResult {
  const map = buildVariableMap(scope);
  const ctx = createContext();

  const urlWithPathParams = substitutePathParams(input.url, input.pathParams ?? [], map, ctx);
  const url = substitute(urlWithPathParams, map, ctx);
  const query = resolveEntries(input.query, map, ctx);
  const headers = resolveEntries(input.headers, map, ctx);
  const auth = resolveAuth(input.auth, map, ctx);
  const body = resolveBody(input.body, map, ctx);

  return {
    url,
    query,
    headers,
    auth,
    body,
    unresolved: [...ctx.unresolved],
    used: [...ctx.used.values()],
    cycles: ctx.cycles,
  };
}

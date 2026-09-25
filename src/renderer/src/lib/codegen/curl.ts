/**
 * "Copy as cURL" (ClickLocal #44) — transforma uma request **já resolvida** (mesmo
 * `variables:resolveRequest` que `useRequestTabsStore.send()` usa: `{{var}}`, path
 * params e herança de auth resolvidos) num comando `curl` para shell POSIX (bash/zsh),
 * no mesmo formato do "Copy as cURL (bash)" do Chrome/Firefox. Base também dos
 * geradores de snippet de outras linguagens (card #46).
 *
 * Espelha as regras da engine (`src/main/http/engine.ts`, `body.ts`, `auth.ts`) para
 * que o comando colado num shell mande a mesma request — conferido contra um servidor
 * local em `src/main/http/curlCodegen.parity.spec.ts`. Mudou uma regra lá (auth
 * aplicada, `Content-Type` padrão, montagem da query)? Muda aqui também.
 *
 * Por padrão nada secreto sai no texto: valores de auth viram `****` e qualquer
 * ocorrência de um valor de variável `secret: true` (passado em `secrets`) também. Só
 * `maskSecrets: false` — a ação explícita "Copy as cURL (with secrets)" — copia tudo.
 */

import type { AuthConfig, HttpMethod, KeyValueEntry, RequestBody } from "@shared";

export const SECRET_MASK = "****";

export interface CurlRequest {
  method: HttpMethod;
  url: string;
  query: KeyValueEntry[];
  headers: KeyValueEntry[];
  /** Tipo concreto (herança já resolvida); `inherit` é tratado como `none`, como em `applyAuth`. */
  auth: AuthConfig;
  body: RequestBody;
}

export interface CurlOptions {
  /** `true` (padrão) troca valores de auth e de `secrets` por `****`. */
  maskSecrets?: boolean;
  /** Valores reais de variáveis `secret: true` usadas na resolução — mascarados onde aparecerem. */
  secrets?: string[];
}

/** Aspas simples de shell POSIX: tudo literal (inclusive `$`, `\` e quebra de linha), `'` vira `'\''`. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function maskText(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of secrets) result = result.split(secret).join(SECRET_MASK);
  return result;
}

export function maskEntries(entries: KeyValueEntry[], secrets: string[]): KeyValueEntry[] {
  return entries.map(entry => ({
    ...entry,
    name: maskText(entry.name, secrets),
    value: maskText(entry.value, secrets),
  }));
}

export function maskBody(body: RequestBody, secrets: string[]): RequestBody {
  switch (body.type) {
    case "json":
      return { ...body, json: maskText(body.json, secrets) };
    case "raw":
      return { ...body, raw: maskText(body.raw, secrets) };
    case "urlencoded":
      return { ...body, urlencoded: maskEntries(body.urlencoded, secrets) };
    case "multipart":
      return {
        ...body,
        multipart: body.multipart.map(entry => ({
          ...entry,
          value: maskText(entry.value, secrets),
        })),
      };
    default:
      return body;
  }
}

/**
 * Auth com os valores sensíveis trocados por `****`. O username do Basic e o nome da API
 * key continuam visíveis — a não ser que venham de uma variável secreta, como qualquer
 * outro texto do comando.
 */
export function maskAuth(auth: AuthConfig, secrets: string[]): AuthConfig {
  const hide = (value: string): string => (value ? SECRET_MASK : value);
  switch (auth.type) {
    case "bearer":
      return { type: "bearer", bearer: { token: hide(auth.bearer.token) } };
    case "basic":
      return {
        type: "basic",
        basic: {
          username: maskText(auth.basic.username, secrets),
          password: hide(auth.basic.password),
        },
      };
    case "apikey":
      return {
        type: "apikey",
        apikey: {
          ...auth.apikey,
          key: maskText(auth.apikey.key, secrets),
          value: hide(auth.apikey.value),
        },
      };
    default:
      return auth;
  }
}

/** Uma entrada já no formato final do `curl`: flag + argumento (ou só a flag). */
type CurlArg = [flag: string, value?: string];

/**
 * Mesma decisão de `applyAuth` (`src/main/http/auth.ts`): um `Authorization` manual
 * habilitado vence bearer/basic; API key sempre entra. Basic vira `--user`, que o
 * `curl` codifica em Base64 dos bytes UTF-8 — o mesmo header que a engine monta, sem
 * precisar de `Buffer` no renderer, e legível no comando copiado.
 */
function authArgs(auth: AuthConfig, headers: KeyValueEntry[], query: KeyValueEntry[]): CurlArg[] {
  if (auth.type === "none" || auth.type === "inherit") return [];

  const manualAuthorization = headers.some(
    header => header.enabled && header.name.toLowerCase() === "authorization",
  );
  if (manualAuthorization && auth.type !== "apikey") return [];

  switch (auth.type) {
    case "bearer":
      return auth.bearer.token ? [["--header", `Authorization: Bearer ${auth.bearer.token}`]] : [];
    case "basic": {
      const { username, password } = auth.basic;
      if (!username && !password) return [];
      return [["--user", `${username}:${password}`]];
    }
    case "apikey": {
      const { key, value, in: location } = auth.apikey;
      if (!key) return [];
      if (location === "query") {
        query.push({ name: key, value, enabled: true });
        return [];
      }
      return [["--header", `${key}: ${value}`]];
    }
  }
}

/**
 * URL final como a engine monta (`applyQuery`): a query string embutida na URL é
 * descartada e a tabela de query é a fonte. `{{var}}` não resolvida volta literal — o
 * `URL` a teria percent-encoded (`%7B%7Bid%7D%7D`) — e, como `{}`/`[]` são glob no
 * `curl`, quem chama liga `--globoff` quando algum sobra no texto.
 */
export function buildUrl(url: string, query: KeyValueEntry[]): string {
  const search = new URLSearchParams(
    query.filter(entry => entry.enabled).map(entry => [entry.name, entry.value]),
  ).toString();

  let base: string;
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    base = parsed.href;
  } catch {
    // Base ainda com `{{baseUrl}}` não resolvida — não é uma URL válida para o `URL`,
    // mas continua sendo o que o usuário precisa ver no comando.
    base = url.split("#")[0].split("?")[0];
  }

  const full = search ? `${base}?${search}` : base;
  return full.replace(/%7B%7B([\w.$-]+?)%7D%7D/gi, "{{$1}}");
}

export function hasEnabledHeader(headers: KeyValueEntry[], name: string): boolean {
  return headers.some(header => header.enabled && header.name.toLowerCase() === name);
}

/** `Content-Type` que a engine adiciona sozinha (`buildRequestBody`) quando o usuário não definiu um. */
function defaultContentType(body: RequestBody): string | undefined {
  switch (body.type) {
    case "json":
      return "application/json";
    case "raw":
      return body.contentType;
    case "urlencoded":
      return "application/x-www-form-urlencoded";
    case "binary":
      return "application/octet-stream";
    default:
      return undefined;
  }
}

/** Caminho de arquivo em `--form name=@path` — `curl` corta em `;`/`,`, então caminhos com eles vão entre aspas duplas. */
function formFilePath(path: string): string {
  return /[;,"]/.test(path) ? `"${path.replace(/(["\\])/g, "\\$1")}"` : path;
}

function bodyArgs(body: RequestBody): CurlArg[] {
  switch (body.type) {
    case "none":
      return [];
    case "json":
      return [["--data-raw", body.json]];
    case "raw":
      return [["--data-raw", body.raw]];
    case "urlencoded": {
      const encoded = new URLSearchParams(
        body.urlencoded.filter(entry => entry.enabled).map(entry => [entry.name, entry.value]),
      ).toString();
      return [["--data-raw", encoded]];
    }
    case "binary":
      return [["--data-binary", `@${body.binary}`]];
    case "multipart":
      // `--form-string` para texto: com `--form`, um valor começando por `@`/`<` viraria
      // leitura de arquivo e `;type=` seria interpretado — nada disso existe na engine.
      return body.multipart
        .filter(entry => entry.enabled)
        .map<CurlArg>(entry =>
          entry.type === "file"
            ? ["--form", `${entry.name}=@${formFilePath(entry.value)}`]
            : ["--form-string", `${entry.name}=${entry.value}`],
        );
  }
}

/** Header no formato do `-H` do `curl` — valor vazio precisa de `Nome;`, porque `Nome:` remove o header em vez de mandá-lo vazio. */
function headerArg(name: string, value: string): CurlArg {
  return ["--header", value === "" ? `${name};` : `${name}: ${value}`];
}

export function toCurl(request: CurlRequest, options: CurlOptions = {}): string {
  const mask = options.maskSecrets ?? true;
  const secrets = mask
    ? [...new Set(options.secrets ?? [])]
        .filter(secret => secret.length > 0)
        .sort((a, b) => b.length - a.length)
    : [];

  const headers = mask ? maskEntries(request.headers, secrets) : request.headers;
  const query = mask ? maskEntries(request.query, secrets) : [...request.query];
  const body = mask ? maskBody(request.body, secrets) : request.body;
  const auth = mask ? maskAuth(request.auth, secrets) : request.auth;
  const url = mask ? maskText(request.url, secrets) : request.url;

  const args: CurlArg[] = [];

  for (const header of headers) {
    if (header.enabled) args.push(headerArg(header.name, header.value));
  }

  const auths = authArgs(auth, headers, query);
  const bodies = bodyArgs(body);
  const hasBody = body.type !== "none";

  const contentType = defaultContentType(body);
  if (hasBody && !hasEnabledHeader(headers, "content-type")) {
    if (contentType) args.push(headerArg("Content-Type", contentType));
    // `raw` sem Content-Type: a engine não manda nenhum, mas `--data-raw` faria o `curl`
    // mandar `application/x-www-form-urlencoded` — `Content-Type:` suprime o dele.
    else if (body.type === "raw") args.push(["--header", "Content-Type:"]);
  }

  args.push(...auths, ...bodies);

  const finalUrl = buildUrl(url, query);
  const head: CurlArg[] = [["--location"]];
  // `-X HEAD` faz o `curl` esperar um corpo que nunca vem; `--head` é o jeito certo.
  if (request.method === "HEAD") head.push(["--head"]);
  else if (request.method !== "GET" || hasBody) head.push(["--request", request.method]);
  if (/[{}[\]]/.test(finalUrl)) head.push(["--globoff"]);

  const firstLine = [
    "curl",
    ...head.map(([flag, value]) => (value === undefined ? flag : `${flag} ${value}`)),
    shellQuote(finalUrl),
  ].join(" ");

  const lines = args.map(([flag, value]) =>
    value === undefined ? flag : `${flag} ${shellQuote(value)}`,
  );
  return [firstLine, ...lines].join(" \\\n  ");
}

import type {
  HttpMethod,
  HttpProgressEvent,
  HttpRequestSettings,
  HttpRequestSpec,
  HttpResponseResult,
  HttpTiming,
  KeyValueEntry,
  RequestBody,
  WttpError,
} from "@shared";
import type { IncomingMessage } from "node:http";
import type { ClientHttp2Session, IncomingHttpHeaders as Http2IncomingHeaders } from "node:http2";

import { Agent as HttpAgent, request as httpRequest } from "node:http";
import { connect as http2Connect } from "node:http2";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";

import { applyAuth } from "./auth";
import { buildRequestBody } from "./body";
import { detectCharset } from "./charset";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 10;
const DEFAULT_VALIDATE_TLS = true;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * `http.request`/`https.request` do Node não adicionam `User-Agent`/`Accept` sozinhos
 * — ao contrário de todo outro cliente HTTP (curl, Postman, browsers). Alguns CDNs/WAFs
 * tratam requisição sem esses headers como não-navegador e roteiam para validação
 * diferente. Nunca `Accept-Encoding`: o engine não descomprime resposta (EP-03), então
 * anunciar suporte a gzip faria o servidor comprimir e devolver corpo ilegível.
 *
 * Espelhado em `RequestConfigTabs.vue` (`AUTO_GENERATED_HEADERS`) só para exibição —
 * `@shared` é apagado por completo na compilação (`src/shared/index.ts`), então não dá
 * pra importar este valor no renderer.
 */
const AUTO_GENERATED_HEADERS: readonly KeyValueEntry[] = [
  { name: "User-Agent", value: "Wttp", enabled: true },
  { name: "Accept", value: "*/*", enabled: true },
];

/**
 * Requests em voo, indexadas por `requestId` — é o que permite `http:cancel` achar o
 * `AbortController` certo (docs/architecture.md §4: "Cancelamento é do main").
 */
const inFlight = new Map<string, AbortController>();

/** Agents com keep-alive: uma request reaproveitando socket não paga DNS/TLS de novo. */
const httpAgent = new HttpAgent({ keepAlive: true });
const httpsAgentsByTlsMode = new Map<boolean, HttpsAgent>();

function getHttpsAgent(validateTls: boolean): HttpsAgent {
  let agent = httpsAgentsByTlsMode.get(validateTls);
  if (!agent) {
    agent = new HttpsAgent({ keepAlive: true, rejectUnauthorized: validateTls });
    httpsAgentsByTlsMode.set(validateTls, agent);
  }
  return agent;
}

/**
 * Sessões HTTP/2 vivas, uma por origem (protocolo+host+porta) + modo de validação TLS
 * — reaproveitada entre requests para a mesma origem (multiplexação de verdade, melhor
 * que o keep-alive de HTTP/1.1). `h2UnsupportedOrigins` evita reprovar ALPN a cada
 * request para uma origem que já respondeu `http/1.1`: curl/Postman/browsers negociam
 * HTTP/2 via ALPN sempre que o servidor oferece — `https.request()` puro do Node nunca
 * faz esse upgrade sozinho, o que fazia o Wttp parecer um cliente diferente de
 * curl/Postman para CDNs que tratam HTTP/1.1 e HTTP/2 de formas diferentes.
 */
const h2Sessions = new Map<string, ClientHttp2Session>();
const h2UnsupportedOrigins = new Set<string>();

function h2OriginKey(url: URL, validateTls: boolean): string {
  return `${url.origin}|${validateTls}`;
}

export function cancelHttpRequest(requestId: string): boolean {
  const controller = inFlight.get(requestId);
  if (!controller) return false;
  controller.abort();
  return true;
}

/**
 * Dispara uma request HTTP e devolve um resultado sempre — erro de rede, DNS, TLS,
 * timeout ou cancelamento é um `HttpResponseResult` com `ok: false`, nunca uma
 * exceção lançada (EP-03-T01).
 *
 * `spec.auth` (já com herança resolvida e variáveis substituídas — EP-07) vira header
 * ou query aqui, via `applyAuth`, antes de qualquer coisa: o resto da função nunca
 * soube que `auth` existe, só enxerga `headers`/`query` já prontos, do jeito que já
 * fazia com variáveis (EP-06).
 *
 * `onProgress`, quando informado, é chamado a cada chunk recebido — quem chama decide
 * se emite isso como `http:progress` no IPC (EP-03-T03) ou ignora.
 */
export async function sendHttpRequest(
  requestSpec: HttpRequestSpec,
  onProgress?: (event: HttpProgressEvent) => void,
): Promise<HttpResponseResult> {
  const spec = applyAuth(requestSpec);
  const controller = new AbortController();
  inFlight.set(spec.requestId, controller);

  const settings = spec.settings;
  const followRedirectsEnabled = settings?.followRedirects ?? true;
  const maxRedirects = settings?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  const totals: HopTiming = { dns: 0, connect: 0, tls: 0, ttfb: 0, download: 0 };
  let url = spec.url;
  let method = spec.method;
  let body = spec.body;

  try {
    for (let redirectCount = 0; ; redirectCount++) {
      let hop: HopOutcome;
      try {
        hop = await performHop(spec, url, method, body, controller.signal, settings, onProgress);
      } catch (error) {
        return {
          ok: false,
          requestId: spec.requestId,
          error: mapError(error, controller.signal),
          timing: totals,
        };
      }

      addTiming(totals, hop.timing);

      const status = hop.response.statusCode;
      const location = hop.response.headers.location;

      if (followRedirectsEnabled && REDIRECT_STATUSES.has(status) && location) {
        if (redirectCount >= maxRedirects) {
          return {
            ok: false,
            requestId: spec.requestId,
            error: { code: "REQUEST_FAILED", message: `Too many redirects (> ${maxRedirects})` },
            timing: totals,
          };
        }
        url = new URL(Array.isArray(location) ? location[0] : location, url).toString();
        ({ method, body } = redirectMethodAndBody(status, method, body));
        continue;
      }

      return finalizeResponse(spec, hop, totals);
    }
  } finally {
    inFlight.delete(spec.requestId);
  }
}

function redirectMethodAndBody(
  status: number,
  method: HttpMethod,
  body: RequestBody,
): { method: HttpMethod; body: RequestBody } {
  const forceGet = status === 303 || ((status === 301 || status === 302) && method === "POST");
  return forceGet ? { method: "GET", body: { type: "none" } } : { method, body };
}

interface HopTiming {
  dns: number;
  connect: number;
  tls: number;
  ttfb: number;
  download: number;
}

/**
 * Forma normalizada de resposta, comum a HTTP/1.1 (`IncomingMessage`) e HTTP/2 (headers
 * vêm como objeto com pseudo-headers, sem frase de status) — o resto do arquivo
 * (redirect, `finalizeResponse`) nunca precisa saber qual protocolo respondeu.
 */
interface HopResponse {
  statusCode: number;
  /** HTTP/2 não tem frase de status — sempre `""` nesse caso. */
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  rawHeaders: string[];
}

interface HopOutcome {
  response: HopResponse;
  body: Buffer;
  timing: HopTiming;
  sentHeadersSize: number;
  sentBodySize: number;
}

class RequestTimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "RequestTimeoutError";
  }
}

class RequestCancelledError extends Error {
  constructor() {
    super("Request was cancelled");
    this.name = "RequestCancelledError";
  }
}

/** Timing de socket capturado uma vez por conexão — zerado quando a conexão é reaproveitada. */
interface SocketTiming {
  hopStart: bigint;
  lookupAt?: bigint;
  connectAt?: bigint;
  secureConnectAt?: bigint;
}

function zeroSocketTiming(hopStart: bigint): SocketTiming {
  return { hopStart, lookupAt: hopStart, connectAt: hopStart, secureConnectAt: hopStart };
}

function timingFrom(base: SocketTiming, firstByteAt: bigint, lastByteAt: bigint): HopTiming {
  const { hopStart, lookupAt, connectAt, secureConnectAt } = base;
  const dnsEnd = lookupAt ?? hopStart;
  const connectEnd = connectAt ?? dnsEnd;
  const tlsEnd = secureConnectAt ?? connectEnd;
  const ttfbEnd = firstByteAt ?? lastByteAt;
  return {
    dns: msBetween(hopStart, dnsEnd),
    connect: msBetween(dnsEnd, connectEnd),
    tls: msBetween(connectEnd, tlsEnd),
    ttfb: msBetween(tlsEnd, ttfbEnd),
    download: msBetween(ttfbEnd, lastByteAt),
  };
}

/** Despacha para HTTP/2 (quando a origem suporta, via ALPN) ou HTTP/1.1, transparente ao resto do arquivo. */
async function performHop(
  spec: HttpRequestSpec,
  urlString: string,
  method: HttpMethod,
  body: RequestBody,
  signal: AbortSignal,
  settings: HttpRequestSettings | undefined,
  onProgress?: (event: HttpProgressEvent) => void,
): Promise<HopOutcome> {
  const url = applyQuery(urlString, spec.query);
  const built = await buildRequestBody(body);
  const headers = buildHeaders(spec.headers, built);
  const isHttps = url.protocol === "https:";
  const timeoutMs = settings?.timeout ?? DEFAULT_TIMEOUT_MS;
  const validateTls = settings?.validateTls ?? DEFAULT_VALIDATE_TLS;

  if (isHttps) {
    const h2 = await acquireHttp2Session(url, validateTls, timeoutMs);
    if (h2) {
      return performHttp2Hop(
        h2.session,
        spec,
        url,
        method,
        headers,
        built,
        signal,
        timeoutMs,
        h2.timing,
        onProgress,
      );
    }
  }

  return performHttp1Hop(
    spec,
    url,
    method,
    headers,
    built,
    isHttps,
    signal,
    timeoutMs,
    validateTls,
    onProgress,
  );
}

/**
 * Sobe (ou reaproveita) uma sessão HTTP/2 para a origem de `url`. `null` quando ALPN
 * negocia `http/1.1` — a origem simplesmente não fala HTTP/2, caso comum, tratado como
 * fallback silencioso (dali em diante fica em `h2UnsupportedOrigins`, sem reprovar). Uma
 * falha real de conexão (DNS, recusa, TLS) rejeita a promise — não faz sentido tentar de
 * novo por HTTP/1.1 nesse caso, a rede já mostrou que a origem está inalcançável.
 */
async function acquireHttp2Session(
  url: URL,
  validateTls: boolean,
  timeoutMs: number,
): Promise<{ session: ClientHttp2Session; timing: SocketTiming } | null> {
  const key = h2OriginKey(url, validateTls);
  if (h2UnsupportedOrigins.has(key)) return null;

  const hopStart = process.hrtime.bigint();
  const existing = h2Sessions.get(key);
  if (existing && !existing.closed && !existing.destroyed) {
    return { session: existing, timing: zeroSocketTiming(hopStart) };
  }

  return new Promise((resolve, reject) => {
    // `http2.connect()` não faz fallback gracioso: oferecer `["h2", "http/1.1"]` não
    // funciona (o próprio Node ignora a lista e envia só `h2` no ClientHello, verificado
    // empiricamente) — por isso a sonda é só `h2`. Uma origem sem suporte devolve o alerta
    // TLS fatal `no_application_protocol` abaixo, tratado como "cai pra HTTP/1.1", não
    // como erro de rede de verdade.
    const session = http2Connect(url.origin, {
      rejectUnauthorized: validateTls,
      ALPNProtocols: ["h2"],
    });

    const timing: SocketTiming = { hopStart };
    session.socket?.once("lookup", () => {
      timing.lookupAt = process.hrtime.bigint();
    });
    session.socket?.once("connect", () => {
      timing.connectAt = process.hrtime.bigint();
    });
    session.socket?.once("secureConnect", () => {
      timing.secureConnectAt = process.hrtime.bigint();
    });

    const timer = setTimeout(() => {
      session.destroy(new RequestTimeoutError());
    }, timeoutMs);

    session.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === "ERR_SSL_TLSV1_ALERT_NO_APPLICATION_PROTOCOL") {
        h2UnsupportedOrigins.add(key);
        resolve(null);
        return;
      }
      reject(error);
    });

    session.once("connect", () => {
      clearTimeout(timer);
      h2Sessions.set(key, session);
      const evict = (): void => {
        if (h2Sessions.get(key) === session) h2Sessions.delete(key);
      };
      session.once("close", evict);
      session.once("error", evict);
      resolve({ session, timing });
    });
  });
}

/**
 * Headers que não fazem sentido em HTTP/2 — a multiplexação substitui a semântica de
 * `Connection`/`Keep-Alive`, e `Host` vira o pseudo-header `:authority`. Node rejeita a
 * request (`ERR_HTTP2_INVALID_CONNECTION_HEADER`) se algum desses passar — nunca vêm da
 * própria engine, só de um header manual do usuário, então filtrar em vez de falhar.
 */
const H2_FORBIDDEN_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function stripForbiddenH2Headers(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (H2_FORBIDDEN_HEADERS.has(name.toLowerCase())) continue;
    result[name] = value;
  }
  return result;
}

function performHttp2Hop(
  session: ClientHttp2Session,
  spec: HttpRequestSpec,
  url: URL,
  method: HttpMethod,
  headers: Record<string, string>,
  built: Awaited<ReturnType<typeof buildRequestBody>>,
  signal: AbortSignal,
  timeoutMs: number,
  socketTiming: SocketTiming,
  onProgress?: (event: HttpProgressEvent) => void,
): Promise<HopOutcome> {
  return new Promise<HopOutcome>((resolve, reject) => {
    const stream = session.request({
      ":method": method,
      ":path": `${url.pathname}${url.search}`,
      ":scheme": "https",
      ":authority": url.host,
      ...stripForbiddenH2Headers(headers),
    });

    let firstByteAt: bigint | undefined;

    stream.on("response", (responseHeaders: Http2IncomingHeaders) => {
      const chunks: Buffer[] = [];
      let bytesReceived = 0;
      const contentLength = Number(responseHeaders["content-length"]);
      const totalBytes =
        Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : undefined;

      stream.on("data", (chunk: Buffer) => {
        firstByteAt ??= process.hrtime.bigint();
        chunks.push(chunk);
        bytesReceived += chunk.byteLength;
        onProgress?.({ requestId: spec.requestId, bytesReceived, totalBytes });
      });
      stream.on("end", () => {
        const lastByteAt = process.hrtime.bigint();
        resolve({
          response: toHopResponse(responseHeaders),
          body: Buffer.concat(chunks),
          timing: timingFrom(socketTiming, firstByteAt ?? lastByteAt, lastByteAt),
          sentHeadersSize: headerBytes(method, url, headers),
          sentBodySize: built?.buffer.byteLength ?? 0,
        });
      });
    });

    stream.setTimeout(timeoutMs, () => {
      stream.destroy(new RequestTimeoutError());
    });

    const onAbort = (): void => {
      stream.destroy(new RequestCancelledError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    stream.on("close", () => {
      signal.removeEventListener("abort", onAbort);
    });

    stream.on("error", reject);

    if (built) stream.write(built.buffer);
    stream.end();
  });
}

/** `:status` e outros pseudo-headers somem — o resto vira o mesmo formato usado pelo lado HTTP/1.1. */
function toHopResponse(responseHeaders: Http2IncomingHeaders): HopResponse {
  const headers: Record<string, string | string[] | undefined> = {};
  const rawHeaders: string[] = [];
  for (const [name, value] of Object.entries(responseHeaders)) {
    if (name.startsWith(":") || value === undefined) continue;
    headers[name] = value;
    if (Array.isArray(value)) {
      for (const v of value) rawHeaders.push(name, v);
    } else {
      rawHeaders.push(name, value);
    }
  }
  return {
    statusCode: Number(responseHeaders[":status"] ?? 0),
    statusText: "",
    headers,
    rawHeaders,
  };
}

function performHttp1Hop(
  spec: HttpRequestSpec,
  url: URL,
  method: HttpMethod,
  headers: Record<string, string>,
  built: Awaited<ReturnType<typeof buildRequestBody>>,
  isHttps: boolean,
  signal: AbortSignal,
  timeoutMs: number,
  validateTls: boolean,
  onProgress?: (event: HttpProgressEvent) => void,
): Promise<HopOutcome> {
  return new Promise<HopOutcome>((resolve, reject) => {
    const hopStart = process.hrtime.bigint();
    const socketTiming: SocketTiming = { hopStart };

    const onResponse = (response: IncomingMessage): void => {
      const chunks: Buffer[] = [];
      let bytesReceived = 0;
      const contentLength = Number(response.headers["content-length"]);
      const totalBytes =
        Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : undefined;

      response.on("data", (chunk: Buffer) => {
        firstByteAt ??= process.hrtime.bigint();
        chunks.push(chunk);
        bytesReceived += chunk.byteLength;
        onProgress?.({ requestId: spec.requestId, bytesReceived, totalBytes });
      });
      response.on("error", reject);
      response.on("end", () => {
        const lastByteAt = process.hrtime.bigint();
        resolve({
          response: {
            statusCode: response.statusCode ?? 0,
            statusText: response.statusMessage ?? "",
            headers: response.headers,
            rawHeaders: response.rawHeaders,
          },
          body: Buffer.concat(chunks),
          timing: timingFrom(socketTiming, firstByteAt ?? lastByteAt, lastByteAt),
          sentHeadersSize: headerBytes(method, url, headers),
          sentBodySize: built?.buffer.byteLength ?? 0,
        });
      });
    };

    let firstByteAt: bigint | undefined;

    const req = isHttps
      ? httpsRequest(url, { method, headers, agent: getHttpsAgent(validateTls) }, onResponse)
      : httpRequest(url, { method, headers, agent: httpAgent }, onResponse);

    // Num socket reaproveitado do pool keep-alive, `lookup`/`connect`/`secureConnect`
    // nunca disparam — por isso o `once` sozinho não basta, senão o listener fica
    // pendurado no socket para sempre e vaza a cada request que o reaproveita.
    let socketRef: import("node:net").Socket | undefined;
    const onLookup = (): void => {
      socketTiming.lookupAt = process.hrtime.bigint();
    };
    const onConnect = (): void => {
      socketTiming.connectAt = process.hrtime.bigint();
    };
    const onSecureConnect = (): void => {
      socketTiming.secureConnectAt = process.hrtime.bigint();
    };

    req.on("socket", socket => {
      socketRef = socket;
      socket.once("lookup", onLookup);
      socket.once("connect", onConnect);
      socket.once("secureConnect", onSecureConnect);
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new RequestTimeoutError());
    });

    const onAbort = (): void => {
      req.destroy(new RequestCancelledError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    req.on("close", () => {
      signal.removeEventListener("abort", onAbort);
      socketRef?.removeListener("lookup", onLookup);
      socketRef?.removeListener("connect", onConnect);
      socketRef?.removeListener("secureConnect", onSecureConnect);
    });

    req.on("error", reject);

    if (built) req.write(built.buffer);
    req.end();
  });
}

function addTiming(totals: HopTiming, hop: HopTiming): void {
  totals.dns += hop.dns;
  totals.connect += hop.connect;
  totals.tls += hop.tls;
  totals.ttfb += hop.ttfb;
  totals.download += hop.download;
}

function msBetween(from: bigint, to: bigint): number {
  return Number(to - from) / 1e6;
}

function applyQuery(urlString: string, query: KeyValueEntry[]): URL {
  const url = new URL(urlString);
  url.search = "";
  for (const entry of query) {
    if (entry.enabled) url.searchParams.append(entry.name, entry.value);
  }
  return url;
}

function buildHeaders(
  specHeaders: KeyValueEntry[],
  built: Awaited<ReturnType<typeof buildRequestBody>>,
): Record<string, string> {
  const headers: Record<string, string> = Object.fromEntries(
    AUTO_GENERATED_HEADERS.map(entry => [entry.name, entry.value]),
  );
  let hasContentType = false;

  for (const entry of specHeaders) {
    if (!entry.enabled) continue;
    const defaultKey = Object.keys(headers).find(
      name => name.toLowerCase() === entry.name.toLowerCase(),
    );
    if (defaultKey && defaultKey !== entry.name) delete headers[defaultKey];
    headers[entry.name] = entry.value;
    if (entry.name.toLowerCase() === "content-type") hasContentType = true;
  }

  if (built) {
    if (!hasContentType && built.contentType) headers["Content-Type"] = built.contentType;
    headers["Content-Length"] = String(built.buffer.byteLength);
  }

  return headers;
}

/** Estimativa de bytes enviados — sempre uma aproximação textual HTTP/1.1, mesmo para HTTP/2 (framing binário com HPACK não tem uma "linha" real). */
function headerBytes(method: HttpMethod, url: URL, headers: Record<string, string>): number {
  let size = Buffer.byteLength(`${method} ${url.pathname}${url.search} HTTP/1.1\r\n`, "utf-8");
  for (const [name, value] of Object.entries(headers)) {
    size += Buffer.byteLength(`${name}: ${value}\r\n`, "utf-8");
  }
  return size;
}

function rawHeadersByteSize(rawHeaders: string[]): number {
  let size = 0;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    size += Buffer.byteLength(`${rawHeaders[i]}: ${rawHeaders[i + 1]}\r\n`, "utf-8");
  }
  return size;
}

function responseHeadersToEntries(rawHeaders: string[]): KeyValueEntry[] {
  const entries: KeyValueEntry[] = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    entries.push({ name: rawHeaders[i], value: rawHeaders[i + 1], enabled: true });
  }
  return entries;
}

function finalizeResponse(
  spec: HttpRequestSpec,
  hop: HopOutcome,
  totals: HopTiming,
): HttpResponseResult {
  const contentType = hop.response.headers["content-type"];

  const timing: HttpTiming = {
    ...totals,
    total: totals.dns + totals.connect + totals.tls + totals.ttfb + totals.download,
  };

  return {
    ok: true,
    requestId: spec.requestId,
    status: hop.response.statusCode,
    statusText: hop.response.statusText,
    headers: responseHeadersToEntries(hop.response.rawHeaders),
    body: new Uint8Array(hop.body.buffer, hop.body.byteOffset, hop.body.byteLength),
    charset: detectCharset(Array.isArray(contentType) ? contentType[0] : contentType),
    size: {
      headersSent: hop.sentHeadersSize,
      bodySent: hop.sentBodySize,
      headersReceived: rawHeadersByteSize(hop.response.rawHeaders),
      bodyReceived: hop.body.byteLength,
    },
    timing,
  };
}

const TLS_ERROR_CODE_PREFIX = "ERR_TLS";
const TLS_ERROR_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_UNTRUSTED",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
]);

function isTlsErrorCode(code: string | undefined): boolean {
  return !!code && (TLS_ERROR_CODES.has(code) || code.startsWith(TLS_ERROR_CODE_PREFIX));
}

function mapError(error: unknown, signal: AbortSignal): WttpError {
  if (error instanceof RequestTimeoutError) {
    return { code: "TIMEOUT", message: error.message };
  }
  if (error instanceof RequestCancelledError || signal.aborted) {
    return { code: "CANCELLED", message: "Request was cancelled" };
  }
  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOTFOUND" || nodeError.code === "EAI_AGAIN") {
      return { code: "DNS_ERROR", message: error.message, detail: nodeError.code };
    }
    if (nodeError.code === "ECONNREFUSED") {
      return { code: "CONNECTION_REFUSED", message: error.message, detail: nodeError.code };
    }
    if (isTlsErrorCode(nodeError.code)) {
      return { code: "TLS_ERROR", message: error.message, detail: nodeError.code };
    }
    return { code: "REQUEST_FAILED", message: error.message, detail: nodeError.code };
  }
  return { code: "UNKNOWN", message: "Unexpected error" };
}

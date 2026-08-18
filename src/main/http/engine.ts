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

import { Agent as HttpAgent, request as httpRequest } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";

import { applyAuth } from "./auth";
import { buildRequestBody } from "./body";
import { detectCharset } from "./charset";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 10;
const DEFAULT_VALIDATE_TLS = true;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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

      const status = hop.response.statusCode ?? 0;
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
        url = new URL(location, url).toString();
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

interface HopOutcome {
  response: IncomingMessage;
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

  return new Promise<HopOutcome>((resolve, reject) => {
    const hopStart = process.hrtime.bigint();
    let lookupAt: bigint | undefined;
    let connectAt: bigint | undefined;
    let secureConnectAt: bigint | undefined;
    let firstByteAt: bigint | undefined;

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
        const dnsEnd = lookupAt ?? hopStart;
        const connectEnd = connectAt ?? dnsEnd;
        const tlsEnd = secureConnectAt ?? connectEnd;
        const ttfbEnd = firstByteAt ?? lastByteAt;
        resolve({
          response,
          body: Buffer.concat(chunks),
          timing: {
            dns: msBetween(hopStart, dnsEnd),
            connect: msBetween(dnsEnd, connectEnd),
            tls: msBetween(connectEnd, tlsEnd),
            ttfb: msBetween(tlsEnd, ttfbEnd),
            download: msBetween(ttfbEnd, lastByteAt),
          },
          sentHeadersSize: headerBytes(method, url, headers),
          sentBodySize: built?.buffer.byteLength ?? 0,
        });
      });
    };

    const req = isHttps
      ? httpsRequest(url, { method, headers, agent: getHttpsAgent(validateTls) }, onResponse)
      : httpRequest(url, { method, headers, agent: httpAgent }, onResponse);

    // Num socket reaproveitado do pool keep-alive, `lookup`/`connect`/`secureConnect`
    // nunca disparam — por isso o `once` sozinho não basta, senão o listener fica
    // pendurado no socket para sempre e vaza a cada request que o reaproveita.
    let socketRef: import("node:net").Socket | undefined;
    const onLookup = (): void => {
      lookupAt = process.hrtime.bigint();
    };
    const onConnect = (): void => {
      connectAt = process.hrtime.bigint();
    };
    const onSecureConnect = (): void => {
      secureConnectAt = process.hrtime.bigint();
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
  for (const entry of query) {
    if (entry.enabled) url.searchParams.append(entry.name, entry.value);
  }
  return url;
}

function buildHeaders(
  specHeaders: KeyValueEntry[],
  built: Awaited<ReturnType<typeof buildRequestBody>>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  let hasContentType = false;

  for (const entry of specHeaders) {
    if (!entry.enabled) continue;
    headers[entry.name] = entry.value;
    if (entry.name.toLowerCase() === "content-type") hasContentType = true;
  }

  if (built) {
    if (!hasContentType && built.contentType) headers["Content-Type"] = built.contentType;
    headers["Content-Length"] = String(built.buffer.byteLength);
  }

  return headers;
}

function headerBytes(method: HttpMethod, url: URL, headers: Record<string, string>): number {
  let size = Buffer.byteLength(`${method} ${url.pathname}${url.search} HTTP/1.1\r\n`, "utf-8");
  for (const [name, value] of Object.entries(headers)) {
    size += Buffer.byteLength(`${name}: ${value}\r\n`, "utf-8");
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

function rawHeadersByteSize(rawHeaders: string[]): number {
  let size = 0;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    size += Buffer.byteLength(`${rawHeaders[i]}: ${rawHeaders[i + 1]}\r\n`, "utf-8");
  }
  return size;
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
    status: hop.response.statusCode ?? 0,
    statusText: hop.response.statusMessage ?? "",
    headers: responseHeadersToEntries(hop.response.rawHeaders),
    body: new Uint8Array(hop.body.buffer, hop.body.byteOffset, hop.body.byteLength),
    charset: detectCharset(contentType),
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

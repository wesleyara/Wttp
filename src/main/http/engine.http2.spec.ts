import type { HttpRequestSpec, HttpResponseResult } from "@shared";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createSecureServer, type Http2SecureServer, type ServerHttp2Session } from "node:http2";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sendHttpRequest } from "./engine";

/**
 * Certificado autoassinado fixo (`__fixtures__`), válido até 2036 — gerado uma vez via
 * `openssl req -x509 ...`, não em cada execução: evita depender do binário `openssl`
 * estar no PATH do CI (garantido em `ubuntu-latest`/`macos-latest`, não em
 * `windows-latest`), o mesmo motivo por que os fixtures de importer são arquivos
 * versionados em vez de gerados na hora.
 */
const KEY = readFileSync(join(__dirname, "__fixtures__/test-key.pem"));
const CERT = readFileSync(join(__dirname, "__fixtures__/test-cert.pem"));

/** Subconjunto comum a `IncomingMessage`/`Http2ServerRequest` e `ServerResponse`/`Http2ServerResponse` — o handler serve os dois servidores abaixo, HTTP/1.1 e o modo de compatibilidade do HTTP/2. */
interface EchoRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "end", listener: () => void): void;
}
interface EchoResponse {
  writeHead(statusCode: number, headers: Record<string, string>): void;
  end(body: string): void;
}

function echoHandler(req: EchoRequest, res: EchoResponse): void {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        method: req.method,
        url: req.url,
        headers: req.headers,
        bodyBase64: Buffer.concat(chunks).toString("base64"),
      }),
    );
  });
}

/**
 * `node:http2.createSecureServer({ allowHTTP1: true })` negocia HTTP/2 via ALPN e cai
 * pra HTTP/1.1 sozinho quando o cliente não oferece `h2` — é o que deixa o mesmo
 * handler (modo de compatibilidade, `req`/`res` como em `node:http`) servir os dois
 * protocolos. `http1OnlyServer` é um `https.createServer` comum: nunca participa de
 * ALPN pra `h2`, exercitando o fallback do engine quando a origem não oferece.
 */
let h2Server: Http2SecureServer;
let h2BaseUrl: string;
/**
 * `Http2SecureServer.close()` só emite `"close"` quando toda sessão aberta termina, e o
 * engine mantém a sessão do cliente viva de propósito (`h2Sessions`, reaproveitada por
 * origem) — sem destruí-las aqui, o `afterAll` espera para sempre. Em Node 24 passava por
 * acaso (fecha sessões ociosas no `close()`); no Node 22 do CI estourava o `hookTimeout`.
 */
const h2ServerSessions = new Set<ServerHttp2Session>();

let http1OnlyServer: HttpsServer;
let http1OnlyBaseUrl: string;

beforeAll(async () => {
  h2Server = createSecureServer({ key: KEY, cert: CERT, allowHTTP1: true }, echoHandler);
  h2Server.on("session", session => {
    h2ServerSessions.add(session);
    session.once("close", () => h2ServerSessions.delete(session));
  });
  await new Promise<void>(resolve => h2Server.listen(0, "127.0.0.1", resolve));
  const h2Address = h2Server.address();
  if (h2Address === null || typeof h2Address === "string")
    throw new Error("failed to bind h2 server");
  h2BaseUrl = `https://127.0.0.1:${h2Address.port}`;

  http1OnlyServer = createHttpsServer({ key: KEY, cert: CERT }, echoHandler);
  await new Promise<void>(resolve => http1OnlyServer.listen(0, "127.0.0.1", resolve));
  const http1Address = http1OnlyServer.address();
  if (http1Address === null || typeof http1Address === "string")
    throw new Error("failed to bind http1-only server");
  http1OnlyBaseUrl = `https://127.0.0.1:${http1Address.port}`;
});

afterAll(async () => {
  const closed = new Promise<void>(resolve => h2Server.once("close", () => resolve()));
  h2Server.close();
  for (const session of h2ServerSessions) session.destroy();
  await closed;
  http1OnlyServer.closeAllConnections();
  await new Promise<void>(resolve => http1OnlyServer.close(() => resolve()));
});

function baseSpec(
  overrides: Partial<HttpRequestSpec> & Pick<HttpRequestSpec, "url">,
): HttpRequestSpec {
  return {
    requestId: randomUUID(),
    method: "GET",
    query: [],
    headers: [],
    auth: { type: "none" },
    body: { type: "none" },
    // Certificado autoassinado — sem isso toda request cairia em TLS_ERROR.
    settings: { validateTls: false },
    ...overrides,
  };
}

async function echoJson(result: HttpResponseResult): Promise<{
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyBase64: string;
}> {
  if (!result.ok) throw new Error(`expected ok result, got error ${JSON.stringify(result.error)}`);
  const text = Buffer.from(result.body).toString("utf-8");
  return JSON.parse(text) as {
    method: string;
    url: string;
    headers: Record<string, string>;
    bodyBase64: string;
  };
}

describe("sendHttpRequest — HTTP/2", () => {
  it("negotiates HTTP/2 over ALPN when the origin offers it", async () => {
    const result = await sendHttpRequest(baseSpec({ url: `${h2BaseUrl}/echo` }));
    const echoed = await echoJson(result);
    expect(echoed.method).toBe("GET");
    // O servidor recebeu `:path`/`:authority` como pseudo-headers HTTP/2, não uma
    // linha de request-line HTTP/1.1 — `node:http2` já reconstrói `req.url` normal.
    expect(echoed.url).toBe("/echo");
  });

  it("sends default headers, query and a body over HTTP/2 like it does over HTTP/1.1", async () => {
    const result = await sendHttpRequest(
      baseSpec({
        url: `${h2BaseUrl}/echo`,
        method: "POST",
        query: [{ name: "q", value: "a b", enabled: true }],
        headers: [{ name: "profile_id", value: "abc-123", enabled: true }],
        body: { type: "json", json: '{"a":1}' },
      }),
    );
    const echoed = await echoJson(result);
    expect(echoed.url).toBe("/echo?q=a+b");
    expect(echoed.headers["user-agent"]).toBeTruthy();
    expect(echoed.headers["accept"]).toBe("*/*");
    expect(echoed.headers["profile_id"]).toBe("abc-123");
    expect(echoed.headers["content-type"]).toBe("application/json");
    expect(Buffer.from(echoed.bodyBase64, "base64").toString("utf-8")).toBe('{"a":1}');
  });

  it("reuses the same HTTP/2 session across requests to the same origin", async () => {
    const first = await sendHttpRequest(baseSpec({ url: `${h2BaseUrl}/echo` }));
    const second = await sendHttpRequest(baseSpec({ url: `${h2BaseUrl}/echo` }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    // A segunda request reaproveita a sessão — timing de conexão zerado, igual ao
    // comportamento já coberto para o pool HTTP/1.1 em engine.spec.ts.
    if (second.ok) {
      expect(second.timing.dns).toBe(0);
      expect(second.timing.connect).toBe(0);
      expect(second.timing.tls).toBe(0);
    }
  });

  it("falls back to HTTP/1.1 when the origin only offers http/1.1 over ALPN", async () => {
    const result = await sendHttpRequest(baseSpec({ url: `${http1OnlyBaseUrl}/echo` }));
    const echoed = await echoJson(result);
    expect(echoed.method).toBe("GET");
    expect(echoed.url).toBe("/echo");
  });

  it("maps a TLS validation failure the same way over HTTP/2", async () => {
    const result = await sendHttpRequest(
      baseSpec({ url: `${h2BaseUrl}/echo`, settings: { validateTls: true } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TLS_ERROR");
  });
});

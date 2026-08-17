import type { HttpRequestSpec, HttpResponseResult } from "@shared";
import type { IncomingMessage, Server } from "node:http";

import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cancelHttpRequest, sendHttpRequest } from "./engine";

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const BINARY_FIXTURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10, 0x20, 0xfe, 0x7f]);

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const body = await readRawBody(req);

    if (url.pathname === "/echo") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          headers: req.headers,
          bodyBase64: body.toString("base64"),
        }),
      );
      return;
    }

    if (url.pathname === "/binary") {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(BINARY_FIXTURE);
      return;
    }

    if (url.pathname === "/never") {
      // Nunca responde — usado para o teste de cancelamento.
      return;
    }

    if (url.pathname === "/slow") {
      setTimeout(() => res.writeHead(200).end("done"), 500);
      return;
    }

    const redirectMatch = /^\/redirect\/(\d+)$/.exec(url.pathname);
    if (redirectMatch) {
      const remaining = Number(redirectMatch[1]);
      const location = remaining > 0 ? `/redirect/${remaining - 1}` : "/final";
      res.writeHead(302, { Location: location });
      res.end();
      return;
    }

    if (url.pathname === "/see-other") {
      res.writeHead(303, { Location: "/echo" });
      res.end();
      return;
    }

    if (url.pathname === "/final") {
      res.writeHead(200).end("final");
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("failed to bind test server");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
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

describe("sendHttpRequest — body types", () => {
  it("sends a json body with an inferred content-type", async () => {
    const result = await sendHttpRequest(
      baseSpec({
        url: `${baseUrl}/echo`,
        method: "POST",
        body: { type: "json", json: '{"a":1}' },
      }),
    );
    const echoed = await echoJson(result);
    expect(echoed.headers["content-type"]).toBe("application/json");
    expect(Buffer.from(echoed.bodyBase64, "base64").toString("utf-8")).toBe('{"a":1}');
  });

  it("sends a urlencoded body, skipping disabled entries", async () => {
    const result = await sendHttpRequest(
      baseSpec({
        url: `${baseUrl}/echo`,
        method: "POST",
        body: {
          type: "urlencoded",
          urlencoded: [
            { name: "grant_type", value: "password", enabled: true },
            { name: "ignored", value: "x", enabled: false },
          ],
        },
      }),
    );
    const echoed = await echoJson(result);
    expect(echoed.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(Buffer.from(echoed.bodyBase64, "base64").toString("utf-8")).toBe("grant_type=password");
  });

  it("sends a raw body with a custom content-type", async () => {
    const result = await sendHttpRequest(
      baseSpec({
        url: `${baseUrl}/echo`,
        method: "POST",
        body: { type: "raw", raw: "<request><id>1</id></request>", contentType: "text/xml" },
      }),
    );
    const echoed = await echoJson(result);
    expect(echoed.headers["content-type"]).toBe("text/xml");
    expect(Buffer.from(echoed.bodyBase64, "base64").toString("utf-8")).toBe(
      "<request><id>1</id></request>",
    );
  });

  it("sends a binary body read from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wttp-http-"));
    const filePath = join(dir, "payload.bin");
    await writeFile(filePath, BINARY_FIXTURE);
    try {
      const result = await sendHttpRequest(
        baseSpec({
          url: `${baseUrl}/echo`,
          method: "POST",
          body: { type: "binary", binary: filePath },
        }),
      );
      const echoed = await echoJson(result);
      expect(Buffer.from(echoed.bodyBase64, "base64").equals(BINARY_FIXTURE)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sends a multipart body with text and file fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wttp-http-"));
    const filePath = join(dir, "avatar.png");
    await writeFile(filePath, BINARY_FIXTURE);
    try {
      const result = await sendHttpRequest(
        baseSpec({
          url: `${baseUrl}/echo`,
          method: "POST",
          body: {
            type: "multipart",
            multipart: [
              { name: "title", type: "text", value: "Avatar", enabled: true },
              { name: "file", type: "file", value: filePath, enabled: true },
              { name: "ignored", type: "text", value: "x", enabled: false },
            ],
          },
        }),
      );
      const echoed = await echoJson(result);
      expect(echoed.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
      const raw = Buffer.from(echoed.bodyBase64, "base64").toString("latin1");
      expect(raw).toContain('name="title"');
      expect(raw).toContain("Avatar");
      expect(raw).toContain('name="file"; filename="avatar.png"');
      expect(raw).not.toContain('name="ignored"');
      expect(raw).toContain(BINARY_FIXTURE.toString("latin1"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not overwrite a manually set content-type", async () => {
    const result = await sendHttpRequest(
      baseSpec({
        url: `${baseUrl}/echo`,
        method: "POST",
        headers: [{ name: "Content-Type", value: "text/plain", enabled: true }],
        body: { type: "json", json: "{}" },
      }),
    );
    const echoed = await echoJson(result);
    expect(echoed.headers["content-type"]).toBe("text/plain");
  });
});

describe("sendHttpRequest — query and headers", () => {
  it("appends only enabled query entries, url-encoded", async () => {
    const result = await sendHttpRequest(
      baseSpec({
        url: `${baseUrl}/echo`,
        query: [
          { name: "q", value: "a b&c", enabled: true },
          { name: "off", value: "x", enabled: false },
        ],
      }),
    );
    const echoed = await echoJson(result);
    const receivedUrl = new URL(echoed.url, baseUrl);
    expect(receivedUrl.searchParams.get("q")).toBe("a b&c");
    expect(receivedUrl.searchParams.has("off")).toBe(false);
  });
});

describe("sendHttpRequest — binary response", () => {
  it("receives the exact bytes sent, without encoding corruption", async () => {
    const result = await sendHttpRequest(baseSpec({ url: `${baseUrl}/binary` }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Buffer.from(result.body).equals(BINARY_FIXTURE)).toBe(true);
    }
  });
});

describe("sendHttpRequest — redirects", () => {
  it("follows redirects by default, up to the final response", async () => {
    const result = await sendHttpRequest(baseSpec({ url: `${baseUrl}/redirect/2` }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(Buffer.from(result.body).toString("utf-8")).toBe("final");
    }
  });

  it("turns a POST into a GET without body on 303", async () => {
    const result = await sendHttpRequest(
      baseSpec({
        url: `${baseUrl}/see-other`,
        method: "POST",
        body: { type: "json", json: '{"a":1}' },
      }),
    );
    const echoed = await echoJson(result);
    expect(echoed.method).toBe("GET");
    expect(echoed.bodyBase64).toBe("");
  });

  it("does not follow redirects when disabled", async () => {
    const result = await sendHttpRequest(
      baseSpec({ url: `${baseUrl}/redirect/1`, settings: { followRedirects: false } }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(302);
      expect(result.headers.some(h => h.name.toLowerCase() === "location")).toBe(true);
    }
  });

  it("fails with a typed error past maxRedirects", async () => {
    const result = await sendHttpRequest(
      baseSpec({ url: `${baseUrl}/redirect/5`, settings: { maxRedirects: 1 } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("REQUEST_FAILED");
  });
});

describe("sendHttpRequest — cancellation and failure modes", () => {
  it("interrupts an in-flight request on cancel", async () => {
    const spec = baseSpec({ url: `${baseUrl}/never` });
    const resultPromise = sendHttpRequest(spec);
    setTimeout(() => cancelHttpRequest(spec.requestId), 20);
    const result = await resultPromise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CANCELLED");
  });

  it("returns a distinct code on timeout", async () => {
    const result = await sendHttpRequest(
      baseSpec({ url: `${baseUrl}/slow`, settings: { timeout: 50 } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TIMEOUT");
  });

  it("returns a distinct code on DNS failure", async () => {
    const result = await sendHttpRequest(
      baseSpec({
        url: "http://this-host-does-not-exist.invalid/",
        settings: { timeout: 5000 },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DNS_ERROR");
  }, 10_000);

  it("returns a distinct code when the connection is refused", async () => {
    const result = await sendHttpRequest(baseSpec({ url: "http://127.0.0.1:1/" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTION_REFUSED");
  });
});

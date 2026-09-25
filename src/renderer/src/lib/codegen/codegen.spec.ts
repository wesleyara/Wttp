import type { IncomingMessage, Server } from "node:http";

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CurlRequest } from "./curl";

import { CODEGEN_LANGUAGES, type CodegenLanguage, generateCode } from "./index";

function request(overrides: Partial<CurlRequest> = {}): CurlRequest {
  return {
    method: "POST",
    url: "https://api.example.com/users",
    query: [{ name: "page", value: "2", enabled: true }],
    headers: [{ name: "X-Trace", value: "abc", enabled: true }],
    auth: { type: "none" },
    body: { type: "none" },
    ...overrides,
  };
}

const BODIES: Record<string, Partial<CurlRequest>> = {
  none: { method: "GET" },
  json: { body: { type: "json", json: '{"name":"Ada","tags":["a","b"]}' } },
  raw: { body: { type: "raw", raw: "plain 'text' with $dollar", contentType: "text/plain" } },
  urlencoded: {
    body: {
      type: "urlencoded",
      urlencoded: [
        { name: "a", value: "1 2", enabled: true },
        { name: "b", value: "x&y", enabled: true },
        { name: "off", value: "no", enabled: false },
      ],
    },
  },
  multipart: {
    body: {
      type: "multipart",
      multipart: [
        { name: "title", type: "text", value: "Hello", enabled: true },
        { name: "avatar", type: "file", value: "/tmp/me.png", enabled: true },
      ],
    },
  },
  binary: { body: { type: "binary", binary: "/tmp/data.bin" } },
};

describe("snapshots: language × body type", () => {
  for (const language of CODEGEN_LANGUAGES) {
    for (const [name, overrides] of Object.entries(BODIES)) {
      it(`${language} · ${name}`, () => {
        expect(generateCode(language, request(overrides))).toMatchSnapshot();
      });
    }
  }
});

describe("auth and secrets", () => {
  const secretRequest = request({
    auth: { type: "bearer", bearer: { token: "sk-live-123" } },
    headers: [{ name: "X-Api", value: "sk-live-123", enabled: true }],
    body: { type: "json", json: '{"token":"sk-live-123"}' },
  });

  it.each(CODEGEN_LANGUAGES)("%s masks secrets by default and shows them on request", language => {
    const masked = generateCode(language, secretRequest, { secrets: ["sk-live-123"] });
    expect(masked).not.toContain("sk-live-123");
    expect(masked).toContain("****");
    const open = generateCode(language, secretRequest, {
      secrets: ["sk-live-123"],
      maskSecrets: false,
    });
    expect(open).toContain("sk-live-123");
  });

  it.each(CODEGEN_LANGUAGES)("%s masks a Basic password", language => {
    const basic = request({
      auth: { type: "basic", basic: { username: "ada", password: "hunter2" } },
    });
    expect(generateCode(language, basic)).not.toContain("hunter2");
    expect(generateCode(language, basic, { maskSecrets: false })).toContain("hunter2");
  });

  it("puts an API key query into the URL and a manual Authorization ahead of bearer", () => {
    const code = generateCode(
      "fetch",
      request({
        auth: { type: "apikey", apikey: { key: "k", value: "v", in: "query" } },
        headers: [{ name: "Authorization", value: "Custom", enabled: true }],
      }),
      { maskSecrets: false },
    );
    expect(code).toContain("k=v");
    expect(code).toContain('"Authorization": "Custom"');
  });
});

describe("fetch snippet, executed for real", () => {
  interface Captured {
    method: string;
    url: string;
    headers: IncomingMessage["headers"];
    body: string;
  }

  let server: Server;
  let baseUrl: string;
  let dir: string;
  const seen: Captured[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "wttp-codegen-"));
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        seen.push({
          method: req.method ?? "",
          url: req.url ?? "",
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok");
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });

  async function run(
    language: CodegenLanguage,
    overrides: Partial<CurlRequest>,
  ): Promise<Captured> {
    const code = generateCode(language, request({ url: `${baseUrl}/echo`, ...overrides }), {
      maskSecrets: false,
    });
    const file = join(dir, `snippet-${seen.length}.mjs`);
    await writeFile(file, code);
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(process.execPath, [file], { timeout: 15_000 }, (error, out, err) =>
        error ? reject(new Error(`${error.message}\n${err}`)) : resolve(out),
      );
    });
    expect(stdout.trim()).toBe("200 ok");
    return seen[seen.length - 1];
  }

  it("reproduces a JSON POST with query, headers and bearer auth", async () => {
    const got = await run("fetch", {
      auth: { type: "bearer", bearer: { token: "t0ken" } },
      body: { type: "json", json: '{"name":"Ada"}' },
    });
    expect(got.method).toBe("POST");
    expect(got.url).toBe("/echo?page=2");
    expect(got.headers["x-trace"]).toBe("abc");
    expect(got.headers.authorization).toBe("Bearer t0ken");
    expect(got.headers["content-type"]).toBe("application/json");
    expect(got.body).toBe('{"name":"Ada"}');
  });

  it("reproduces a raw body with a custom content type and non-ASCII text", async () => {
    const got = await run("fetch", {
      body: { type: "raw", raw: "olá 'mundo' $x", contentType: "text/plain" },
    });
    expect(got.headers["content-type"]).toBe("text/plain");
    expect(got.body).toBe("olá 'mundo' $x");
  });

  it("reproduces a urlencoded body", async () => {
    const got = await run("fetch", BODIES.urlencoded);
    expect(got.body).toBe("a=1+2&b=x%26y");
    expect(got.headers["content-type"]).toContain("application/x-www-form-urlencoded");
  });

  it("reproduces Basic auth and a text multipart field", async () => {
    const got = await run("fetch", {
      auth: { type: "basic", basic: { username: "ada", password: "pässword" } },
      body: {
        type: "multipart",
        multipart: [{ name: "title", type: "text", value: "Hello", enabled: true }],
      },
    });
    expect(got.headers.authorization).toBe(
      `Basic ${Buffer.from("ada:pässword", "utf8").toString("base64")}`,
    );
    expect(got.headers["content-type"]).toContain("multipart/form-data");
    expect(got.body).toContain('name="title"');
    expect(got.body).toContain("Hello");
  });
});

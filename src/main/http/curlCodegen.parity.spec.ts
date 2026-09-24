/**
 * "Copy as cURL" (ClickLocal #44): o comando gerado no renderer
 * (`src/renderer/src/lib/codegen/curl.ts`) precisa mandar a mesma request que a engine
 * manda. Este spec mora no main — e importa o gerador pelo caminho relativo — porque é
 * aqui que existem `node:*`, a engine e o parser de cURL para comparar lado a lado; o
 * gerador em si é puro e não depende de nada do main.
 *
 * Roda o `curl` de verdade num `sh`. Sem `curl`/`sh` no PATH (ou no Windows, onde o
 * quoting de `sh -c` com o `curl.exe` nativo não é o que o comando copiado assume) a
 * parte de shell é pulada; o round-trip com o parser roda sempre.
 */

import type { HttpRequestSpec, RequestBody } from "@shared";
import type { IncomingMessage, Server } from "node:http";

import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type CurlRequest, toCurl } from "../../renderer/src/lib/codegen/curl";
import { parseCurlCommand } from "../importers/curl";
import { sendHttpRequest } from "./engine";

interface Captured {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: Buffer;
}

/** `sh` (dash, no Debian/Ubuntu) não aceita `--version` — pergunta ao próprio `sh` se o `curl` existe. */
function curlAvailableInSh(): boolean {
  try {
    execFileSync("sh", ["-c", "command -v curl"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const canRunCurl = process.platform !== "win32" && curlAvailableInSh();

let server: Server;
let baseUrl: string;
let tempDir: string;
const captured: Captured[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      captured.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks),
      });
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(req.method === "HEAD" ? undefined : "ok");
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  tempDir = await mkdtemp(join(tmpdir(), "wttp-curl-parity-"));
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(tempDir, { recursive: true, force: true });
});

async function viaEngine(request: CurlRequest): Promise<Captured> {
  const spec: HttpRequestSpec = { requestId: randomUUID(), ...request };
  const result = await sendHttpRequest(spec);
  expect(result.ok).toBe(true);
  return captured[captured.length - 1];
}

async function viaCurl(request: CurlRequest): Promise<Captured> {
  const command = toCurl(request, { maskSecrets: false });
  await new Promise<void>((resolve, reject) => {
    execFile("sh", ["-c", `${command} --silent --show-error --output /dev/null`], error =>
      error ? reject(error) : resolve(),
    );
  });
  return captured[captured.length - 1];
}

/** Multipart tem boundary aleatório dos dois lados — compara as partes, não os bytes. */
function multipartParts(capturedRequest: Captured): string[] {
  const contentType = String(capturedRequest.headers["content-type"] ?? "");
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1] ?? "";
  return capturedRequest.body
    .toString("latin1")
    .split(`--${boundary}`)
    .slice(1, -1)
    .map(part => {
      const [head, ...rest] = part.split("\r\n\r\n");
      const disposition = /Content-Disposition: [^\r\n]+/i.exec(head)?.[0] ?? "";
      return `${disposition}\n${rest.join("\r\n\r\n")}`;
    });
}

const PICKED_HEADERS = ["authorization", "x-trace", "x-api-key", "x-empty"];

interface Comparable {
  method: string;
  url: string;
  contentType: string;
  headers: Record<string, string | string[] | undefined>;
  body: string | string[];
}

function comparable(capturedRequest: Captured, body: RequestBody): Comparable {
  const contentType = String(capturedRequest.headers["content-type"] ?? "");
  return {
    method: capturedRequest.method,
    url: capturedRequest.url,
    contentType: contentType.replace(/; boundary=.+$/, ""),
    headers: Object.fromEntries(PICKED_HEADERS.map(name => [name, capturedRequest.headers[name]])),
    body:
      body.type === "multipart"
        ? multipartParts(capturedRequest)
        : capturedRequest.body.toString("base64"),
  };
}

function request(overrides: Partial<CurlRequest>): CurlRequest {
  return {
    method: "GET",
    url: `${baseUrl}/items`,
    query: [],
    headers: [],
    auth: { type: "none" },
    body: { type: "none" },
    ...overrides,
  };
}

describe.skipIf(!canRunCurl)("copy as cURL reproduces the engine's request", () => {
  const cases: [string, () => Promise<CurlRequest>][] = [
    [
      "GET with query table, headers and an empty header",
      async () =>
        request({
          url: `${baseUrl}/items?stale=1`,
          query: [
            { name: "page", value: "2", enabled: true },
            { name: "q", value: "a b&c/é", enabled: true },
            { name: "off", value: "x", enabled: false },
          ],
          headers: [
            { name: "X-Trace", value: 'it\'s "quoted" $HOME', enabled: true },
            { name: "X-Empty", value: "", enabled: true },
          ],
        }),
    ],
    [
      "POST multiline JSON with single quotes and bearer auth",
      async () =>
        request({
          method: "POST",
          auth: { type: "bearer", bearer: { token: "tkn-'123'" } },
          body: { type: "json", json: `{\n  "name": "O'Brien",\n  "note": "$HOME \\n"\n}` },
        }),
    ],
    [
      "PUT urlencoded with basic auth (UTF-8 password)",
      async () =>
        request({
          method: "PUT",
          auth: { type: "basic", basic: { username: "admin", password: "sênha:1" } },
          body: {
            type: "urlencoded",
            urlencoded: [
              { name: "a", value: "1 2", enabled: true },
              { name: "b", value: "x&y=z", enabled: true },
            ],
          },
        }),
    ],
    [
      "PATCH raw text with api key in header",
      async () =>
        request({
          method: "PATCH",
          auth: { type: "apikey", apikey: { key: "X-Api-Key", value: "k-1", in: "header" } },
          body: { type: "raw", raw: "line 1\nline 'two'", contentType: "text/plain" },
        }),
    ],
    [
      "DELETE with api key in query",
      async () =>
        request({
          method: "DELETE",
          query: [{ name: "force", value: "true", enabled: true }],
          auth: { type: "apikey", apikey: { key: "api_key", value: "k 2", in: "query" } },
        }),
    ],
    [
      "POST multipart with a text field and a file",
      async () => {
        const file = join(tempDir, "upload;v1.txt");
        await writeFile(file, "file contents\n");
        return request({
          method: "POST",
          body: {
            type: "multipart",
            multipart: [
              { name: "title", type: "text", value: "@looks-like-a-file", enabled: true },
              { name: "doc", type: "file", value: file, enabled: true },
            ],
          },
        });
      },
    ],
    [
      "POST binary file",
      async () => {
        const file = join(tempDir, "blob.bin");
        await writeFile(file, Buffer.from([0x00, 0xff, 0x10, 0x0a, 0x27]));
        return request({ method: "POST", body: { type: "binary", binary: file } });
      },
    ],
    [
      "manual Authorization header wins over bearer",
      async () =>
        request({
          headers: [{ name: "Authorization", value: "Token manual", enabled: true }],
          auth: { type: "bearer", bearer: { token: "ignored" } },
        }),
    ],
    ["HEAD", async () => request({ method: "HEAD" })],
  ];

  it.each(cases)("%s", async (_name, build) => {
    const spec = await build();
    const fromEngine = comparable(await viaEngine(spec), spec.body);
    const fromCurl = comparable(await viaCurl(spec), spec.body);
    expect(fromCurl).toEqual(fromEngine);
  });
});

describe("copy as cURL round-trips through the cURL parser", () => {
  it("parses back to the same request", () => {
    const original = request({
      method: "POST",
      url: "https://api.example.com/users",
      query: [{ name: "v", value: "1 2", enabled: true }],
      headers: [
        { name: "X-Trace", value: "it's", enabled: true },
        { name: "X-Empty", value: "", enabled: true },
      ],
      auth: { type: "basic", basic: { username: "admin", password: "p:w" } },
      body: { type: "json", json: '{\n  "a": "b\'c"\n}' },
    });

    const parsed = parseCurlCommand(toCurl(original, { maskSecrets: false }));

    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("https://api.example.com/users");
    expect(parsed.query).toEqual(original.query);
    expect(parsed.headers).toEqual([
      ...original.headers,
      { name: "Content-Type", value: "application/json", enabled: true },
    ]);
    expect(parsed.auth).toEqual(original.auth);
    expect(parsed.body).toEqual(original.body);
    expect(parsed.notConverted).toEqual([]);
  });

  it("round-trips multipart text/file parts, binary bodies and HEAD", () => {
    const multipart = parseCurlCommand(
      toCurl(
        request({
          method: "POST",
          body: {
            type: "multipart",
            multipart: [
              { name: "t", type: "text", value: "@x;type=y", enabled: true },
              { name: "f", type: "file", value: '/tmp/a;b "c".txt', enabled: true },
            ],
          },
        }),
      ),
    );
    expect(multipart.body).toEqual({
      type: "multipart",
      multipart: [
        { name: "t", type: "text", value: "@x;type=y", enabled: true },
        { name: "f", type: "file", value: '/tmp/a;b "c".txt', enabled: true },
      ],
    });

    const binary = parseCurlCommand(
      toCurl(request({ method: "PUT", body: { type: "binary", binary: "/tmp/blob.bin" } })),
    );
    expect(binary.method).toBe("PUT");
    expect(binary.body).toEqual({ type: "binary", binary: "/tmp/blob.bin" });

    const head = parseCurlCommand(toCurl(request({ method: "HEAD" })));
    expect(head.method).toBe("HEAD");
    expect(head.notConverted).toEqual([]);
  });
});

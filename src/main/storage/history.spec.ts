import type { HttpRequestSpec, HttpResponseResult } from "@shared";

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appendHistory,
  deleteHistoryFile,
  MAX_BODY_BYTES,
  MAX_ENTRIES,
  readHistory,
  renameHistoryFile,
} from "./history";

let root: string;
const PATH = "users/list.req.yaml";

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-history-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function requestSpec(overrides: Partial<HttpRequestSpec> = {}): HttpRequestSpec {
  return {
    requestId: "r1",
    method: "GET",
    url: "https://api.example.com/users",
    query: [],
    headers: [],
    auth: { type: "none" },
    body: { type: "none" },
    ...overrides,
  };
}

function successResponse(overrides: Partial<HttpResponseResult> = {}): HttpResponseResult {
  return {
    ok: true,
    requestId: "r1",
    status: 200,
    statusText: "OK",
    headers: [],
    body: new TextEncoder().encode("{}"),
    charset: "utf-8",
    size: { headersSent: 0, bodySent: 0, headersReceived: 0, bodyReceived: 2 },
    timing: { dns: 0, connect: 0, tls: 0, ttfb: 1, download: 1, total: 2 },
    ...overrides,
  } as HttpResponseResult;
}

describe("history", () => {
  it("devolve vazio quando não há histórico ainda", async () => {
    expect(await readHistory(root, PATH)).toEqual([]);
  });

  it("guarda a entrada mais recente primeiro", async () => {
    await appendHistory(root, PATH, {
      request: requestSpec(),
      response: successResponse(),
      secrets: [],
    });
    await appendHistory(root, PATH, {
      request: requestSpec({ url: "https://api.example.com/users/2" }),
      response: successResponse(),
      secrets: [],
    });

    const entries = await readHistory(root, PATH);
    expect(entries).toHaveLength(2);
    expect(entries[0].request.url).toBe("https://api.example.com/users/2");
  });

  it(`mantém só as ${MAX_ENTRIES} mais recentes, rotação FIFO`, async () => {
    for (let i = 0; i < MAX_ENTRIES + 1; i++) {
      await appendHistory(root, PATH, {
        request: requestSpec({ url: `https://api.example.com/users/${i}` }),
        response: successResponse(),
        secrets: [],
      });
    }

    const entries = await readHistory(root, PATH);
    expect(entries).toHaveLength(MAX_ENTRIES);
    // A mais antiga (índice 0) foi descartada; a última gravada (índice MAX_ENTRIES) é a primeira da lista.
    expect(entries[0].request.url).toBe(`https://api.example.com/users/${MAX_ENTRIES}`);
    expect(entries.at(-1)?.request.url).toBe("https://api.example.com/users/1");
  });

  it("trunca corpo de resposta maior que o limite, sinalizado na entrada", async () => {
    const bigBody = "x".repeat(MAX_BODY_BYTES + 1000);
    await appendHistory(root, PATH, {
      request: requestSpec(),
      response: successResponse({ body: new TextEncoder().encode(bigBody) }),
      secrets: [],
    });

    const [entry] = await readHistory(root, PATH);
    if (!entry.response.ok) throw new Error("expected ok response");
    expect(entry.response.bodyTruncated).toBe(true);
    expect(Buffer.byteLength(entry.response.body, "utf-8")).toBeLessThanOrEqual(MAX_BODY_BYTES);
  });

  it("não trunca corpo dentro do limite", async () => {
    await appendHistory(root, PATH, {
      request: requestSpec(),
      response: successResponse({ body: new TextEncoder().encode('{"ok":true}') }),
      secrets: [],
    });

    const [entry] = await readHistory(root, PATH);
    if (!entry.response.ok) throw new Error("expected ok response");
    expect(entry.response.bodyTruncated).toBe(false);
    expect(entry.response.body).toBe('{"ok":true}');
  });

  it("mascara valor de variável secret em qualquer lugar da request e da resposta", async () => {
    await appendHistory(root, PATH, {
      request: requestSpec({
        url: "https://api.example.com/users?token=s3cr3t",
        query: [{ name: "token", value: "s3cr3t", enabled: true }],
        headers: [{ name: "X-Custom", value: "prefix-s3cr3t-suffix", enabled: true }],
        body: { type: "json", json: '{"token":"s3cr3t"}' },
      }),
      response: successResponse({ body: new TextEncoder().encode('{"echo":"s3cr3t"}') }),
      secrets: ["s3cr3t"],
    });

    const [entry] = await readHistory(root, PATH);
    const raw = JSON.stringify(entry);
    expect(raw).not.toContain("s3cr3t");
    expect(entry.request.url).toBe("https://api.example.com/users?token=[secret]");
    expect(entry.request.query[0].value).toBe("[secret]");
    expect(entry.request.headers[0].value).toBe("prefix-[secret]-suffix");
    expect(entry.request.body).toEqual({ type: "json", json: '{"token":"[secret]"}' });
    if (!entry.response.ok) throw new Error("expected ok response");
    expect(entry.response.body).toBe('{"echo":"[secret]"}');
  });

  it("mascara o header Authorization inteiro, mesmo sem nenhum secret na lista", async () => {
    await appendHistory(root, PATH, {
      request: requestSpec({
        headers: [{ name: "Authorization", value: "Bearer literal-token", enabled: true }],
      }),
      response: successResponse(),
      secrets: [],
    });

    const [entry] = await readHistory(root, PATH);
    expect(entry.request.headers[0]).toEqual({
      name: "Authorization",
      value: "[secret]",
      enabled: true,
    });
  });

  it("mascara o Authorization injetado pela auth da request (bearer), não só um header manual", async () => {
    await appendHistory(root, PATH, {
      request: requestSpec({ auth: { type: "bearer", bearer: { token: "s3cr3t" } } }),
      response: successResponse(),
      secrets: ["s3cr3t"],
    });

    const [entry] = await readHistory(root, PATH);
    const authHeader = entry.request.headers.find(h => h.name === "Authorization");
    expect(authHeader?.value).toBe("[secret]");
  });

  it("envio que falhou entra no histórico como erro, com a mensagem também mascarada", async () => {
    await appendHistory(root, PATH, {
      request: requestSpec(),
      response: {
        ok: false,
        requestId: "r1",
        error: { code: "TIMEOUT", message: "timed out after s3cr3t retries" },
      },
      secrets: ["s3cr3t"],
    });

    const [entry] = await readHistory(root, PATH);
    expect(entry.response).toEqual({
      ok: false,
      error: { code: "TIMEOUT", message: "timed out after [secret] retries" },
    });
  });

  it("apaga o arquivo de histórico, sem erro se ele não existir", async () => {
    await appendHistory(root, PATH, {
      request: requestSpec(),
      response: successResponse(),
      secrets: [],
    });
    await deleteHistoryFile(root, PATH);
    expect(await readHistory(root, PATH)).toEqual([]);
    await expect(deleteHistoryFile(root, PATH)).resolves.toBeUndefined();
  });

  it("renomear move o arquivo de histórico para o novo path", async () => {
    await appendHistory(root, PATH, {
      request: requestSpec(),
      response: successResponse(),
      secrets: [],
    });
    await renameHistoryFile(root, PATH, "users/list-all.req.yaml");

    expect(await readHistory(root, PATH)).toEqual([]);
    expect(await readHistory(root, "users/list-all.req.yaml")).toHaveLength(1);
  });

  it("renomear sem histórico prévio é um no-op", async () => {
    await expect(renameHistoryFile(root, PATH, "users/other.req.yaml")).resolves.toBeUndefined();
  });
});

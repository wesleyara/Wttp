import type {
  FolderFile,
  FolderNode,
  RequestFile,
  RequestNode,
  RunCollectionOptions,
  RunEvent,
  RunRequestResult,
} from "@shared";
import type { IncomingMessage, Server } from "node:http";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { RunnerDeps } from "./execute";

import { cancelHttpRequest, sendHttpRequest } from "../http/engine";
import { executeScript } from "../scripts/api";
import {
  createEnvironment,
  createNode,
  initWorkspace,
  writeEnvironment,
  writeNode,
} from "../storage/tree";
import { runCollection } from "./run";

interface Hit {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
}

let server: Server;
let baseUrl: string;
const hits: Hit[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      hits.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      });
      if (url.pathname === "/slow") {
        setTimeout(() => res.end("late"), 5_000);
        return;
      }
      if (url.pathname === "/login") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ token: "tkn-42" }));
        return;
      }
      const status = Number(url.searchParams.get("status") ?? 200);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: status < 400, path: url.pathname }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

let root: string;

beforeEach(async () => {
  hits.length = 0;
  root = await mkdtemp(join(tmpdir(), "wttp-runner-"));
  await initWorkspace(root, "Runner test");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const deps: RunnerDeps = {
  send: spec => sendHttpRequest(spec),
  cancel: requestId => void cancelHttpRequest(requestId),
  runScript: async spec => executeScript(spec),
  secretValue: async (_env, name) => (name === "apiKey" ? "secret-key" : null),
};

async function folder(
  parent: string,
  name: string,
  extra: Partial<FolderFile> = {},
): Promise<string> {
  const node = (await createNode(root, parent, "folder", name)) as FolderNode;
  if (Object.keys(extra).length > 0) {
    await writeNode(root, node.path, { ...node, data: { ...node.data!, ...extra } });
  }
  return node.path;
}

async function request(parent: string, name: string, extra: Partial<RequestFile>): Promise<string> {
  const node = (await createNode(root, parent, "request", name)) as RequestNode;
  await writeNode(root, node.path, { ...node, data: { ...node.data!, ...extra } });
  return node.path;
}

async function run(
  overrides: Partial<RunCollectionOptions> = {},
  signal: AbortSignal = new AbortController().signal,
): Promise<{ events: RunEvent[]; summary: Awaited<ReturnType<typeof runCollection>> }> {
  const events: RunEvent[] = [];
  const summary = await runCollection(
    {
      root,
      targetPath: "",
      environmentPath: null,
      iterations: 1,
      delayMs: 0,
      bail: false,
      persistVariables: false,
      ...overrides,
    },
    deps,
    signal,
    { onEvent: event => events.push({ runId: "t", ...event } as RunEvent) },
  );
  return { events, summary };
}

function finishedResults(events: RunEvent[]): RunRequestResult[] {
  return events.flatMap(event => (event.type === "requestFinished" ? [event.result] : []));
}

describe("runCollection (EP-13-T01)", () => {
  it("runs the folder's requests in tree order, for every iteration", async () => {
    const api = await folder("", "API");
    await request(api, "First", { url: `${baseUrl}/one` });
    const nested = await folder(api, "Nested");
    await request(nested, "Deep", { url: `${baseUrl}/deep` });
    await request(api, "Last", { url: `${baseUrl}/two` });

    const { events, summary } = await run({ targetPath: api, iterations: 2 });

    expect(hits.map(hit => hit.url)).toEqual(["/one", "/deep", "/two", "/one", "/deep", "/two"]);
    const started = events[0];
    expect(started.type === "started" && started.plan.map(item => item.name)).toEqual([
      "First",
      "Deep",
      "Last",
    ]);
    expect(summary).toMatchObject({ total: 6, passed: 6, failed: 0, endedEarly: null });
    expect(events.at(-1)?.type).toBe("finished");
  });

  it("chains variables between requests: login stores a token, the next request sends it", async () => {
    const env = await createEnvironment(root, "Dev");
    await writeEnvironment(root, env.path, {
      ...env.data,
      variables: [
        { name: "base", value: baseUrl, enabled: true },
        { name: "apiKey", value: "", enabled: true, secret: true },
      ],
    });
    const api = await folder("", "API", {
      auth: { type: "apikey", apikey: { key: "X-Api-Key", value: "{{apiKey}}", in: "header" } },
    });
    await request(api, "Login", {
      method: "POST",
      url: "{{base}}/login",
      auth: { type: "none" },
      scripts: {
        tests:
          'wttp.setVar("token", res.json.token);\ntest("got a token", () => expect(res.json.token).toBeTruthy());',
      },
    });
    await request(api, "Me", {
      url: "{{base}}/me",
      auth: { type: "bearer", bearer: { token: "{{token}}" } },
    });
    await request(api, "Inherits", { url: "{{base}}/inherits", auth: { type: "inherit" } });

    const { summary, events } = await run({ targetPath: api, environmentPath: env.path });

    expect(hits[1].headers.authorization).toBe("Bearer tkn-42");
    expect(hits[2].headers["x-api-key"]).toBe("secret-key");
    expect(summary).toMatchObject({ total: 3, passed: 3, assertions: { total: 1, passed: 1 } });
    // Sem `persistVariables`, nada foi gravado.
    const onDisk = await readFile(join(root, "environments", env.path), "utf-8");
    expect(onDisk).not.toContain("tkn-42");
    expect(finishedResults(events)[1].url).toBe(`${baseUrl}/me`);
  });

  it("persists script variable changes at the end when asked, never touching secrets", async () => {
    const env = await createEnvironment(root, "Dev");
    await writeEnvironment(root, env.path, {
      ...env.data,
      variables: [{ name: "apiKey", value: "", enabled: true, secret: true }],
    });
    const api = await folder("", "API");
    await request(api, "Login", {
      url: `${baseUrl}/login`,
      scripts: {
        tests:
          'wttp.setVar("token", res.json.token);\nwttp.setVar("apiKey", "leak");\nwttp.setCollectionVar("seen", "yes");',
      },
    });

    await run({ targetPath: api, environmentPath: env.path, persistVariables: true });

    const envFile = await readFile(join(root, "environments", env.path), "utf-8");
    expect(envFile).toContain("tkn-42");
    expect(envFile).not.toContain("leak");
    const folderFile = await readFile(join(root, api, "folder.yaml"), "utf-8");
    expect(folderFile).toContain("seen");
  });

  it("keeps going after a failure by default, and stops at the first one with bail", async () => {
    const api = await folder("", "API");
    await request(api, "Fails", {
      url: `${baseUrl}/x`,
      query: [{ name: "status", value: "500", enabled: true }],
      scripts: { tests: 'test("is 200", () => expect(res.status).toBe(200));' },
    });
    await request(api, "Next", { url: `${baseUrl}/next` });

    const keepGoing = await run({ targetPath: api });
    expect(keepGoing.summary).toMatchObject({ total: 2, passed: 1, failed: 1, endedEarly: null });

    hits.length = 0;
    const bail = await run({ targetPath: api, bail: true });
    expect(bail.summary).toMatchObject({ total: 1, failed: 1, endedEarly: "bail" });
    expect(hits.map(hit => hit.url)).toEqual(["/x?status=500"]);
  });

  it("marks a request without tests as passed even on 4xx/5xx, but a network error as failed", async () => {
    const api = await folder("", "API");
    await request(api, "NotFound", {
      url: `${baseUrl}/x`,
      query: [{ name: "status", value: "404", enabled: true }],
    });
    await request(api, "Refused", { url: "http://127.0.0.1:1/nope" });

    const { events } = await run({ targetPath: api });
    const [notFound, refused] = finishedResults(events);
    expect(notFound).toMatchObject({ status: 404, passed: true });
    expect(refused).toMatchObject({
      status: null,
      passed: false,
      error: { error: { code: "CONNECTION_REFUSED" } },
    });
  });

  it("a failing pre-request script fails only that request, with its source", async () => {
    const api = await folder("", "API", { scripts: { preRequest: "throw new Error('boom')" } });
    await request(api, "One", { url: `${baseUrl}/one` });

    const { events } = await run({ targetPath: api });
    const [one] = finishedResults(events);
    expect(one).toMatchObject({
      passed: false,
      error: { source: "API", error: { message: expect.stringContaining("boom") } },
    });
    expect(hits).toHaveLength(0);
  });

  it("stop interrupts the request in flight and runs nothing after it", async () => {
    const api = await folder("", "API");
    await request(api, "Slow", { url: `${baseUrl}/slow` });
    await request(api, "After", { url: `${baseUrl}/after` });

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const startedAt = Date.now();
    const { summary, events } = await run({ targetPath: api }, controller.signal);

    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(finishedResults(events)[0]).toMatchObject({ cancelled: true });
    expect(summary).toMatchObject({ total: 0, endedEarly: "stopped" });
    expect(hits.map(hit => hit.url)).toEqual(["/slow"]);
  });

  it("honors the selection's order and rejects a request outside the target", async () => {
    const api = await folder("", "API");
    const a = await request(api, "A", { url: `${baseUrl}/a` });
    const b = await request(api, "B", { url: `${baseUrl}/b` });
    const other = await folder("", "Other");
    const c = await request(other, "C", { url: `${baseUrl}/c` });

    await run({ targetPath: api, selection: [b, a] });
    expect(hits.map(hit => hit.url)).toEqual(["/b", "/a"]);

    const outside = await run({ targetPath: api, selection: [c] });
    expect(outside.events).toEqual([
      expect.objectContaining({
        type: "failed",
        error: expect.objectContaining({ code: "INVALID_PAYLOAD" }),
      }),
    ]);
  });

  it("reports a missing environment or empty selection as a failed run, without throwing", async () => {
    const api = await folder("", "API");
    await request(api, "One", { url: `${baseUrl}/one` });
    const missingEnv = await run({ environmentPath: "nope.yaml" });
    expect(missingEnv.events[0]).toMatchObject({ type: "failed", error: { code: "ENOENT" } });
    const empty = await run({ selection: [] });
    expect(empty.events[0]).toMatchObject({ type: "failed", error: { code: "INVALID_PAYLOAD" } });
  });

  it("runs 100 requests in well under the UI budget", async () => {
    const api = await folder("", "API");
    for (let i = 0; i < 100; i++) await request(api, `R${i}`, { url: `${baseUrl}/r${i}` });

    const startedAt = Date.now();
    const { summary } = await run({ targetPath: api });
    expect(summary).toMatchObject({ total: 100, passed: 100 });
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });
});

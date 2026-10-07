import type {
  FlowEvent,
  FlowFile,
  FlowNode,
  FlowNodeResult,
  FlowRunSummary,
  FolderNode,
  RequestFile,
  RequestNode,
} from "@shared";
import type { IncomingMessage, Server } from "node:http";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cancelHttpRequest, sendHttpRequest } from "../http/engine";
import { type RunnerDeps } from "../runner/execute";
import { executeScript } from "../scripts/api";
import { createFlow, writeFlow } from "../storage/flows";
import { createNode, initWorkspace, renameNode, writeNode } from "../storage/tree";
import { runFlow } from "./run";

interface Hit {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
}

let server: Server;
let baseUrl: string;
const hits: Hit[] = [];
const jobCalls = new Map<string, number>();

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      hits.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers });
      const authorized = req.headers.authorization === "Bearer tkn-42";
      const json = (status: number, body: unknown, headers: Record<string, string> = {}): void => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === "/login" && req.method === "POST") {
        json(200, { data: { token: "tkn-42" } });
      } else if (url.pathname === "/users" && req.method === "POST") {
        if (!authorized) json(401, {});
        else json(201, { id: 7, items: [{ ref: "first" }] }, { location: "/users/7" });
      } else if (url.pathname === "/users/7") {
        if (!authorized) json(401, {});
        else json(200, { id: 7, name: "Ada" });
      } else if (url.pathname === "/job") {
        // Job assíncrono: `done` na chamada `doneAt` (nunca, se ausente).
        const key = url.searchParams.get("k") ?? "";
        const calls = (jobCalls.get(key) ?? 0) + 1;
        jobCalls.set(key, calls);
        const doneAt = Number(url.searchParams.get("doneAt") ?? Infinity);
        json(200, { job: { state: calls >= doneAt ? "done" : "pending", calls } });
      } else if (url.pathname === "/text") {
        res.writeHead(200, { "content-type": "text/plain" }).end("not json");
      } else if (url.pathname === "/ok") {
        json(200, { ok: true });
      } else {
        json(404, {});
      }
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
  jobCalls.clear();
  root = await mkdtemp(join(tmpdir(), "wttp-flow-run-"));
  await initWorkspace(root, "Flow test");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const deps: RunnerDeps = {
  send: spec => sendHttpRequest(spec),
  cancel: requestId => void cancelHttpRequest(requestId),
  runScript: async spec => executeScript(spec),
  secretValue: async () => null,
};

async function request(parent: string, name: string, extra: Partial<RequestFile>): Promise<string> {
  const node = (await createNode(root, parent, "request", name)) as RequestNode;
  await writeNode(root, node.path, { ...node, data: { ...node.data!, ...extra } });
  return node.path;
}

async function makeFlow(flow: Omit<FlowFile, "wttp" | "name">): Promise<string> {
  const created = await createFlow(root, "Scenario");
  await writeFlow(root, created.path, { ...created.data!, ...flow });
  return created.path;
}

interface RunOutcome {
  events: FlowEvent[];
  nodes: FlowNodeResult[];
  summary: FlowRunSummary | undefined;
}

async function run(
  path: string,
  overrides: { bail?: boolean; signal?: AbortSignal; flow?: FlowFile } = {},
): Promise<RunOutcome> {
  const events: FlowEvent[] = [];
  await runFlow(
    {
      root,
      path,
      environmentPath: null,
      bail: overrides.bail ?? true,
      delayMs: 0,
      flow: overrides.flow,
    },
    deps,
    overrides.signal ?? new AbortController().signal,
    { onEvent: event => events.push({ runId: "t", ...event } as FlowEvent) },
  );
  const finished = events.find(event => event.type === "finished");
  return {
    events,
    nodes: events.flatMap(event => (event.type === "nodeFinished" ? [event.node] : [])),
    summary: finished?.type === "finished" ? finished.summary : undefined,
  };
}

/** A collection do cenário: login → criar usuário → buscar usuário, sem uma linha de script. */
async function scenario(): Promise<{
  login: string;
  create: string;
  fetch: string;
  ok: string;
}> {
  const api = (await createNode(root, "", "folder", "API")) as FolderNode;
  const login = await request(api.path, "Login", { method: "POST", url: `${baseUrl}/login` });
  const create = await request(api.path, "Create user", {
    method: "POST",
    url: `${baseUrl}/users`,
    auth: { type: "bearer", bearer: { token: "{{token}}" } },
  });
  const fetch = await request(api.path, "Get user", {
    url: `${baseUrl}/users/{{user_id}}`,
    auth: { type: "bearer", bearer: { token: "{{token}}" } },
  });
  const ok = await request(api.path, "Ok", { url: `${baseUrl}/ok` });
  return { login, create, fetch, ok };
}

/** A engine envia a query da tabela (`applyQuery`), não a embutida na URL. */
const query = (params: Record<string, string>): RequestFile["query"] =>
  Object.entries(params).map(([name, value]) => ({ name, value, enabled: true }));

const request_ = (id: string, path: string): FlowNode => ({ id, type: "request", request: path });

describe("runFlow — linear (ClickLocal #57)", () => {
  it("passes the token and the id between nodes through mappings only", async () => {
    const { login, create, fetch } = await scenario();
    const path = await makeFlow({
      nodes: [request_("login", login), request_("create", create), request_("fetch", fetch)],
      edges: [
        { from: "login", to: "create" },
        { from: "create", to: "fetch" },
      ],
      mappings: [
        { from: "login.res.body.data.token", to: "token" },
        { from: "create.res.body.id", to: "user_id" },
        { from: "create.res.headers.Location", to: "where" },
        { from: "create.res.body.items[0].ref", to: "ref" },
        { from: "fetch.res.status", to: "last_status" },
      ],
    });

    const { nodes, summary } = await run(path);

    expect(nodes.map(node => [node.nodeId, node.result?.status, node.passed])).toEqual([
      ["login", 200, true],
      ["create", 201, true],
      ["fetch", 200, true],
    ]);
    expect(nodes[0].produced).toEqual([
      { name: "token", value: "tkn-42", from: "login.res.body.data.token" },
    ]);
    expect(nodes[1].produced.map(variable => [variable.name, variable.value])).toEqual([
      ["user_id", "7"],
      ["where", "/users/7"],
      ["ref", "first"],
    ]);
    expect(nodes[2].produced).toEqual([
      { name: "last_status", value: "200", from: "fetch.res.status" },
    ]);
    expect(nodes[0].response?.status).toBe(200);
    expect(nodes[0].response?.body).toContain("tkn-42");
    // O servidor só aceitou o token e o id porque os mapeamentos os entregaram.
    expect(hits.map(hit => `${hit.method} ${hit.url}`)).toEqual([
      "POST /login",
      "POST /users",
      "GET /users/7",
    ]);
    expect(hits[1].headers.authorization).toBe("Bearer tkn-42");
    expect(summary).toMatchObject({ total: 3, passed: 3, failed: 0, endedEarly: null });
  });

  it("runs a v1 file after the migration, with the same result", async () => {
    const { login, create, fetch } = await scenario();
    const { writeFile } = await import("node:fs/promises");
    const created = await createFlow(root, "Legacy");
    await writeFile(
      join(root, "flows", created.path),
      `wttp: 1
name: Legacy
nodes:
  - { id: login, request: ${login} }
  - { id: create, request: ${create} }
  - { id: fetch, request: ${fetch} }
mappings:
  - { from: login.res.body.data.token, to: token }
  - { from: create.res.body.id, to: user_id }
`,
    );
    const { nodes } = await run(created.path);
    expect(nodes.map(node => node.passed)).toEqual([true, true, true]);
    expect(hits.map(hit => hit.url)).toEqual(["/login", "/users", "/users/7"]);
  });

  it("writes nothing to disk: the mapped variables only live during the run", async () => {
    const { login, create, fetch } = await scenario();
    const path = await makeFlow({
      nodes: [request_("login", login), request_("create", create), request_("fetch", fetch)],
      edges: [
        { from: "login", to: "create" },
        { from: "create", to: "fetch" },
      ],
      mappings: [
        { from: "login.res.body.data.token", to: "token" },
        { from: "create.res.body.id", to: "user_id" },
      ],
    });
    const before = await readFile(join(root, "wttp.yaml"), "utf-8");
    await run(path);
    expect(await readFile(join(root, "wttp.yaml"), "utf-8")).toBe(before);
  });

  it("fails the node when a mapping finds nothing, and stops there (bail)", async () => {
    const { login, create } = await scenario();
    const path = await makeFlow({
      nodes: [request_("login", login), request_("create", create)],
      edges: [{ from: "login", to: "create" }],
      mappings: [{ from: "login.res.body.data.nope", to: "token" }],
    });

    const { nodes, summary } = await run(path);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].passed).toBe(false);
    expect(nodes[0].mappingErrors[0]).toMatch(/"data\.nope" not found in the response body/);
    expect(summary).toMatchObject({ failed: 1, endedEarly: "bail" });
    expect(hits).toHaveLength(1);
  });

  it("keeps going after a failure when bail is off", async () => {
    const { login, create } = await scenario();
    const path = await makeFlow({
      nodes: [request_("login", login), request_("create", create)],
      edges: [{ from: "login", to: "create" }],
      mappings: [{ from: "login.res.body.data.nope", to: "token" }],
    });

    const { nodes } = await run(path, { bail: false });

    // Como no Runner, uma resposta 401 sem asserções não é falha por si só — o que falhou foi o mapeamento.
    expect(nodes.map(node => node.passed)).toEqual([false, true]);
    expect(nodes[1].result?.status).toBe(401);
    expect(nodes[1].result?.unresolved).toContain("token");
  });

  it("explains a body that is not JSON and a missing header", async () => {
    const api = (await createNode(root, "", "folder", "API")) as FolderNode;
    const text = await request(api.path, "Text", { url: `${baseUrl}/text` });
    const path = await makeFlow({
      nodes: [request_("text", text)],
      mappings: [
        { from: "text.res.body.a", to: "a" },
        { from: "text.res.headers.X-Missing", to: "b" },
      ],
    });
    const { nodes } = await run(path, { bail: false });
    expect(nodes[0].mappingErrors).toEqual([
      expect.stringMatching(/the response body is not JSON/),
      expect.stringMatching(/header "X-Missing" not found/),
    ]);
  });

  it("refuses to start when a node points to a request that no longer exists", async () => {
    const { login, create } = await scenario();
    const path = await makeFlow({
      nodes: [
        request_("login", login),
        request_("gone", "API/removed.req.yaml"),
        request_("create", create),
      ],
      edges: [
        { from: "login", to: "gone" },
        { from: "gone", to: "create" },
      ],
    });

    const { events } = await run(path);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "failed",
      error: { code: "FLOW_INVALID" },
      issues: [{ nodeId: "gone" }],
    });
    expect(hits).toHaveLength(0);
  });

  it("follows a request renamed in the tree, so the flow keeps working", async () => {
    const { login, create, fetch } = await scenario();
    const path = await makeFlow({
      nodes: [request_("login", login), request_("create", create), request_("fetch", fetch)],
      edges: [
        { from: "login", to: "create" },
        { from: "create", to: "fetch" },
      ],
      mappings: [
        { from: "login.res.body.data.token", to: "token" },
        { from: "create.res.body.id", to: "user_id" },
      ],
    });

    await renameNode(root, login, "Sign in");
    const { nodes } = await run(path);

    expect(nodes.map(node => node.passed)).toEqual([true, true, true]);
    expect(nodes[0].result?.name).toBe("Sign in");
  });

  it("stops between nodes when the signal aborts", async () => {
    const { login, create } = await scenario();
    const path = await makeFlow({
      nodes: [request_("login", login), request_("create", create)],
      edges: [{ from: "login", to: "create" }],
    });
    const controller = new AbortController();
    const events: FlowEvent[] = [];
    await runFlow(
      { root, path, environmentPath: null, bail: false, delayMs: 0 },
      deps,
      controller.signal,
      {
        onEvent: event => {
          events.push({ runId: "t", ...event } as FlowEvent);
          if (event.type === "nodeFinished") controller.abort();
        },
      },
    );
    expect(events.filter(event => event.type === "nodeFinished")).toHaveLength(1);
    expect(events.find(event => event.type === "finished")).toMatchObject({
      summary: { endedEarly: "stopped" },
    });
  });

  it("runs the draft it is given instead of the file on disk", async () => {
    const { ok } = await scenario();
    const path = await makeFlow({ nodes: [] });
    const { nodes } = await run(path, {
      flow: { wttp: 2, name: "Draft", nodes: [request_("ok", ok)] },
    });
    expect(nodes.map(node => node.nodeId)).toEqual(["ok"]);
    expect(hits.map(hit => hit.url)).toEqual(["/ok"]);
  });
});

describe("runFlow — conditions, poll until, delay (ClickLocal #59)", () => {
  /** create → condition(status == 201): true → fetch, false → ok ("recover"). */
  async function branching(withLogin: boolean): Promise<string> {
    const { login, create, fetch, ok } = await scenario();
    return makeFlow({
      start: withLogin ? "login" : "create",
      nodes: [
        request_("login", login),
        request_("create", create),
        { id: "created", type: "condition", when: { source: "status", op: "eq", value: "201" } },
        request_("fetch", fetch),
        request_("recover", ok),
      ],
      edges: [
        { from: "login", to: "create" },
        { from: "create", to: "created" },
        { from: "created", to: "fetch", when: true },
        { from: "created", to: "recover", when: false },
      ],
      mappings: [
        { from: "login.res.body.data.token", to: "token" },
        { from: "create.res.body.id", to: "user_id" },
      ],
    });
  }

  it("follows the true branch when the condition holds", async () => {
    const { nodes, summary } = await run(await branching(true));

    expect(nodes.map(node => node.nodeId)).toEqual(["login", "create", "created", "fetch"]);
    expect(nodes[2]).toMatchObject({ type: "condition", outcome: "true", passed: true });
    expect(nodes[2].message).toBe("status == 201 → true");
    expect(hits.map(hit => hit.url)).toEqual(["/login", "/users", "/users/7"]);
    expect(summary).toMatchObject({ failed: 0, endedEarly: null });
  });

  it("follows the false branch when it does not", async () => {
    // Sem login não há token: o servidor responde 401 e a condição manda para o ramo de recuperação.
    const { nodes, summary } = await run(await branching(false));

    expect(nodes.map(node => node.nodeId)).toEqual(["create", "created", "recover"]);
    expect(nodes[1]).toMatchObject({ outcome: "false", passed: true });
    expect(hits.map(hit => hit.url)).toEqual(["/users", "/ok"]);
    expect(summary?.endedEarly).toBeNull();
  });

  it("decides on a body field and on the assertions", async () => {
    const api = (await createNode(root, "", "folder", "API")) as FolderNode;
    const job = await request(api.path, "Job", {
      url: `${baseUrl}/job`,
      query: query({ k: "c", doneAt: "1" }),
    });
    const ok = await request(api.path, "Ok", { url: `${baseUrl}/ok` });
    const path = await makeFlow({
      nodes: [
        request_("job", job),
        {
          id: "isDone",
          type: "condition",
          when: { source: "body", path: "job.state", op: "eq", value: "done" },
        },
        { id: "noTests", type: "condition", when: { source: "assertions" } },
        request_("ok", ok),
      ],
      edges: [
        { from: "job", to: "isDone" },
        { from: "isDone", to: "noTests", when: true },
        { from: "noTests", to: "ok", when: true },
      ],
    });
    const { nodes, summary } = await run(path);
    expect(nodes.map(node => [node.nodeId, node.outcome])).toEqual([
      ["job", undefined],
      ["isDone", "true"],
      // Nenhuma asserção rodou: "asserções passaram" é falso, e sem saída `false` o flow termina.
      ["noTests", "false"],
    ]);
    expect(summary?.endedEarly).toBeNull();
    expect(hits.map(hit => hit.url)).toEqual(["/job?k=c&doneAt=1"]);
  });

  it("polls until the first `done` and goes on", async () => {
    const api = (await createNode(root, "", "folder", "API")) as FolderNode;
    const job = await request(api.path, "Job", {
      url: `${baseUrl}/job`,
      query: query({ k: "a", doneAt: "3" }),
    });
    const ok = await request(api.path, "Ok", { url: `${baseUrl}/ok` });
    const path = await makeFlow({
      nodes: [
        request_("job", job),
        {
          id: "wait",
          type: "pollUntil",
          when: { source: "body", path: "job.state", op: "eq", value: "done" },
          intervalMs: 1000,
          maxAttempts: 10,
        },
        request_("after", ok),
      ],
      edges: [
        { from: "job", to: "wait" },
        { from: "wait", to: "after" },
      ],
    });

    const started = Date.now();
    const { nodes, summary } = await run(path);

    // Parou na terceira resposta (a primeira `done`): nem uma chamada a mais.
    expect(hits.filter(hit => hit.url.startsWith("/job"))).toHaveLength(3);
    const poll = nodes.find(node => node.nodeId === "wait")!;
    expect(poll).toMatchObject({ type: "pollUntil", passed: true, attempts: 3 });
    expect(hits.at(-1)?.url).toBe("/ok");
    expect(summary).toMatchObject({ failed: 0, endedEarly: null });
    expect(Date.now() - started).toBeGreaterThanOrEqual(1900);
  });

  it("fails cleanly at the attempts limit, and does not go on", async () => {
    const api = (await createNode(root, "", "folder", "API")) as FolderNode;
    const job = await request(api.path, "Job", {
      url: `${baseUrl}/job`,
      query: query({ k: "never" }),
    });
    const ok = await request(api.path, "Ok", { url: `${baseUrl}/ok` });
    const path = await makeFlow({
      nodes: [
        request_("job", job),
        {
          id: "wait",
          type: "pollUntil",
          when: { source: "body", path: "job.state", op: "eq", value: "done" },
          intervalMs: 1000,
          maxAttempts: 2,
        },
        request_("after", ok),
      ],
      edges: [
        { from: "job", to: "wait" },
        { from: "wait", to: "after" },
      ],
    });

    const { nodes, summary } = await run(path);

    const poll = nodes.find(node => node.nodeId === "wait")!;
    expect(poll).toMatchObject({ passed: false, attempts: 2 });
    expect(poll.message).toMatch(/was not met after 2 attempts/);
    expect(hits.filter(hit => hit.url.startsWith("/job"))).toHaveLength(2);
    expect(hits.some(hit => hit.url === "/ok")).toBe(false);
    expect(summary).toMatchObject({ endedEarly: "bail" });
    expect(summary?.message).toMatch(/not met after 2 attempts/);
  });

  it("waits for a fixed delay", async () => {
    const { ok } = await scenario();
    const path = await makeFlow({
      nodes: [request_("a", ok), { id: "pause", type: "delay", ms: 150 }, request_("b", ok)],
      edges: [
        { from: "a", to: "pause" },
        { from: "pause", to: "b" },
      ],
    });
    const started = Date.now();
    const { nodes } = await run(path);
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect(nodes[1]).toMatchObject({ type: "delay", passed: true, message: "waited 150 ms" });
    expect(hits).toHaveLength(2);
  });

  it("stops a looping flow at the global step limit, with a clear message", async () => {
    const { ok } = await scenario();
    const path = await makeFlow({
      maxSteps: 7,
      nodes: [
        request_("a", ok),
        { id: "again", type: "condition", when: { source: "status", op: "eq", value: "200" } },
      ],
      edges: [
        { from: "a", to: "again" },
        { from: "again", to: "a", when: true },
      ],
    });

    const { nodes, summary } = await run(path);

    expect(nodes).toHaveLength(7);
    expect(hits).toHaveLength(4);
    expect(summary).toMatchObject({ endedEarly: "limit" });
    expect(summary?.message).toMatch(/stopped after 7 steps/);
  });

  it("refuses a poll without a request right before it, and a condition with no response", async () => {
    const { ok } = await scenario();
    const polled = await makeFlow({
      nodes: [
        request_("a", ok),
        { id: "pause", type: "delay", ms: 1 },
        {
          id: "wait",
          type: "pollUntil",
          when: { source: "status", op: "eq", value: "200" },
          intervalMs: 1000,
          maxAttempts: 2,
        },
      ],
      edges: [
        { from: "a", to: "pause" },
        { from: "pause", to: "wait" },
      ],
    });
    const { events } = await run(polled);
    expect(events[0]).toMatchObject({
      type: "failed",
      error: { code: "FLOW_INVALID" },
      issues: [{ nodeId: "wait" }],
    });

    const lonely = await makeFlow({
      nodes: [{ id: "c", type: "condition", when: { source: "status", op: "eq", value: "200" } }],
    });
    const { nodes, summary } = await run(lonely);
    expect(nodes[0]).toMatchObject({ passed: false });
    expect(nodes[0].message).toMatch(/no previous response/);
    expect(summary?.endedEarly).toBe("bail");
  });
});

describe("runFlow — function node", () => {
  const fn = (id: string, outputs: number, code: string): FlowNode => ({
    id,
    type: "function",
    outputs,
    code,
  });

  it("follows the output the code chose", async () => {
    const { login, ok, fetch } = await scenario();
    const path = await makeFlow({
      nodes: [
        request_("login", login),
        fn("route", 2, "return res.status === 200 ? 1 : 2;"),
        request_("ok", ok),
        request_("other", fetch),
      ],
      edges: [
        { from: "login", to: "route" },
        { from: "route", to: "ok", output: 1 },
        { from: "route", to: "other", output: 2 },
      ],
    });

    const { nodes, summary } = await run(path);

    expect(nodes.map(node => node.nodeId)).toEqual(["login", "route", "ok"]);
    expect(nodes[1]).toMatchObject({ type: "function", passed: true, output: 1 });
    expect(nodes[1].message).toBe("followed output 1");
    expect(hits.map(hit => hit.url)).toEqual(["/login", "/ok"]);
    expect(summary).toMatchObject({ failed: 0, endedEarly: null });
  });

  it("takes the other output when the code says so", async () => {
    const { login, ok, fetch } = await scenario();
    const path = await makeFlow({
      nodes: [
        request_("login", login),
        fn("route", 2, "return res.status === 999 ? 1 : 2;"),
        request_("ok", ok),
        request_("other", fetch),
      ],
      edges: [
        { from: "login", to: "route" },
        { from: "route", to: "ok", output: 1 },
        { from: "route", to: "other", output: 2 },
      ],
    });
    const { nodes } = await run(path);
    expect(nodes.map(node => node.nodeId)).toEqual(["login", "route", "other"]);
  });

  it("writes flow variables that the next requests read — no mapping, no script on the request", async () => {
    const { login, create, fetch } = await scenario();
    const path = await makeFlow({
      nodes: [
        request_("login", login),
        fn(
          "prepare",
          1,
          "vars.token = res.json.data.token; vars.user_id = String(3 + 4); return 1;",
        ),
        request_("create", create),
        request_("fetch", fetch),
      ],
      edges: [
        { from: "login", to: "prepare" },
        { from: "prepare", to: "create", output: 1 },
        { from: "create", to: "fetch" },
      ],
    });

    const { nodes, summary } = await run(path);

    expect(nodes.map(node => node.result?.status ?? node.nodeId)).toEqual([
      200,
      "prepare",
      201,
      200,
    ]);
    expect(hits.map(hit => `${hit.method} ${hit.url}`)).toEqual([
      "POST /login",
      "POST /users",
      "GET /users/7",
    ]);
    expect(summary).toMatchObject({ failed: 0, endedEarly: null });
  });

  it("ends the flow when the code returns nothing", async () => {
    const { login, ok } = await scenario();
    const path = await makeFlow({
      nodes: [request_("login", login), fn("stop", 1, "// nothing to do"), request_("ok", ok)],
      edges: [
        { from: "login", to: "stop" },
        { from: "stop", to: "ok", output: 1 },
      ],
    });
    const { nodes, summary } = await run(path);
    expect(nodes.map(node => node.nodeId)).toEqual(["login", "stop"]);
    expect(nodes[1]).toMatchObject({ passed: true, output: null });
    expect(nodes[1].message).toMatch(/flow ends here/);
    expect(summary).toMatchObject({ failed: 0, endedEarly: null });
    expect(hits).toHaveLength(1);
  });

  it("fails the node and stops on a bad output, a thrown error and captured console output", async () => {
    const { login, ok } = await scenario();
    const edges = [
      { from: "login", to: "f" },
      { from: "f", to: "ok", output: 1 },
    ];
    const bad = await makeFlow({
      nodes: [
        request_("login", login),
        fn("f", 1, "console.log('x'); return 5;"),
        request_("ok", ok),
      ],
      edges,
    });
    const first = await run(bad);
    expect(first.nodes[1]).toMatchObject({ passed: false });
    expect(first.nodes[1].message).toMatch(/chose output 5, but this node has 1 output/);
    expect(first.summary).toMatchObject({ endedEarly: "bail" });
    expect(hits.some(hit => hit.url === "/ok")).toBe(false);

    const thrown = await makeFlow({
      nodes: [request_("login", login), fn("f", 1, "throw new Error('nope')"), request_("ok", ok)],
      edges,
    });
    const second = await run(thrown, { bail: false });
    // Uma função que falha não escolheu saída: o flow para mesmo sem `bail`.
    expect(second.nodes.map(node => node.nodeId)).toEqual(["login", "f"]);
    expect(second.nodes[1].message).toMatch(/nope/);
  });

  it("runs the code in the isolated script runner: no require, process or fs", async () => {
    const { login } = await scenario();
    const path = await makeFlow({
      nodes: [
        request_("login", login),
        fn(
          "probe",
          2,
          "return typeof require === 'undefined' && typeof process === 'undefined' ? 1 : 2;",
        ),
      ],
      edges: [{ from: "login", to: "probe" }],
    });
    const { nodes } = await run(path);
    expect(nodes[1]).toMatchObject({ passed: true, output: 1 });
  });
});

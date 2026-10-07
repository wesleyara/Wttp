import type { FlowFile, FolderNode, RequestNode } from "@shared";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createFlow,
  deleteFlow,
  listFlows,
  renameFlow,
  rewriteFlowReferences,
  writeFlow,
} from "./flows";
import { parseFlow } from "./parser";
import { serializeFlow } from "./serializer";
import { createNode, initWorkspace, moveNodeInto, renameNode, scanWorkspace } from "./tree";
import { validateFlow } from "./validate";

/** O formato do card #57: lista linear de requests e mapeamentos. */
const FLOW_V1 = `wttp: 1
name: Login and fetch
nodes:
  - { id: login, request: auth/login.req.yaml, x: 0, y: 0 }
  - { id: create, request: users/create.req.yaml, x: 280, y: 40 }
  - { id: fetch, request: users/get.req.yaml, x: 560, y: 0 }
mappings:
  - { from: login.res.body.data.token, to: token }
  - { from: create.res.headers.Location, to: where }
  - { from: fetch.res.status, to: code }
`;

/** O mesmo flow, depois da migração: cada nó ganha \`type\` e as arestas vêm da ordem antiga. */
const FLOW_V2 = `wttp: 2
name: Login and fetch
nodes:
  - { id: login, type: request, request: auth/login.req.yaml, x: 0, y: 0 }
  - { id: create, type: request, request: users/create.req.yaml, x: 280, y: 40 }
  - { id: fetch, type: request, request: users/get.req.yaml, x: 560, y: 0 }
edges:
  - { from: login, to: create }
  - { from: create, to: fetch }
mappings:
  - { from: login.res.body.data.token, to: token }
  - { from: create.res.headers.Location, to: where }
  - { from: fetch.res.status, to: code }
`;

const FLOW_CONTROL = `wttp: 2
name: Create or recover
start: create
nodes:
  - { id: create, type: request, request: users/create.req.yaml, x: 0, y: 0 }
  - { id: created, type: condition, when: { source: status, op: eq, value: "201" }, x: 280, y: 0 }
  - { id: job, type: request, request: jobs/get.req.yaml, x: 560, y: 0 }
  - { id: wait, type: pollUntil, when: { source: body, path: job.state, op: eq, value: done }, intervalMs: 1000, maxAttempts: 5, x: 840, y: 0 }
  - { id: pause, type: delay, ms: 2000, x: 560, y: 120 }
  - { id: recover, type: request, request: users/get.req.yaml, x: 840, y: 120 }
edges:
  - { from: create, to: created }
  - { from: created, to: job, when: true }
  - { from: created, to: pause, when: false }
  - { from: job, to: wait }
  - { from: pause, to: recover }
maxSteps: 50
`;

/** Um nó de função: o `code` vai em bloco literal, legível no diff, e as arestas dele saem por `output`. */
const FLOW_FUNCTION = `wttp: 2
name: Route by status
nodes:
  - { id: login, type: request, request: auth/login.req.yaml, x: 0, y: 0 }
  - id: route
    type: function
    outputs: 3
    code: |
      if (res.status === 201) return 1;
      vars.reason = "failed";
      return 2;
    x: 280
    y: 0
  - { id: ok, type: request, request: users/get.req.yaml, x: 560, y: 0 }
  - { id: retry, type: delay, ms: 500, x: 560, y: 120 }
edges:
  - { from: login, to: route }
  - { from: route, to: ok, output: 1 }
  - { from: route, to: retry, output: 2 }
`;

describe("flow file format v2 (ClickLocal #57/#59)", () => {
  it("round-trips byte for byte, with control nodes", () => {
    for (const yaml of [FLOW_V2, FLOW_CONTROL]) {
      const result = validateFlow(yaml);
      expect(result.valid ? [] : result.issues).toEqual([]);
      if (!result.valid) return;
      expect(serializeFlow(result.value)).toBe(yaml);
      expect(serializeFlow(parseFlow(yaml))).toBe(yaml);
    }
  });

  it("round-trips a function node byte for byte, with its code as a literal block", () => {
    const result = validateFlow(FLOW_FUNCTION);
    expect(result.valid ? [] : result.issues).toEqual([]);
    if (!result.valid) return;
    const route = result.value.nodes.find(node => node.id === "route")!;
    expect(route).toMatchObject({ type: "function", outputs: 3 });
    expect(route.code).toBe(
      'if (res.status === 201) return 1;\nvars.reason = "failed";\nreturn 2;\n',
    );
    expect(serializeFlow(result.value)).toBe(FLOW_FUNCTION);
    // Código de uma linha só, ou sem quebra no fim, também é estável.
    const single = parseFlow(
      "wttp: 2\nname: S\nnodes:\n  - id: f\n    type: function\n    outputs: 1\n    code: return 1;\n",
    );
    expect(serializeFlow(single)).toBe(
      "wttp: 2\nname: S\nnodes:\n  - id: f\n    type: function\n    outputs: 1\n    code: return 1;\n",
    );
  });

  it("validates a function node's outputs, code and edges", () => {
    const base = "nodes:\n  - { id: a, type: delay, ms: 1 }\n";
    const fn = (extra: string): string => `${base}  - id: f\n    type: function\n${extra}`;
    expect(invalid(fn("    outputs: 2\n"))).toMatch(/"code" é obrigatório/);
    expect(invalid(fn("    code: return 1;\n"))).toMatch(/"outputs" é obrigatório/);
    expect(invalid(fn("    outputs: 0\n    code: x\n"))).toMatch(/entre 1 e 10/);
    expect(invalid(fn("    outputs: 11\n    code: x\n"))).toMatch(/entre 1 e 10/);
    expect(invalid(fn("    outputs: 1.5\n    code: x\n"))).toMatch(/inteiro/);
    const edges = (list: string): string => `${fn("    outputs: 2\n    code: x\n")}edges:\n${list}`;
    expect(invalid(edges("  - { from: f, to: a }\n"))).toMatch(/precisa de "output" entre 1 e 2/);
    expect(invalid(edges("  - { from: f, to: a, output: 3 }\n"))).toMatch(/entre 1 e 2/);
    expect(
      invalid(edges("  - { from: f, to: a, output: 1 }\n  - { from: f, to: a, output: 1 }\n")),
    ).toMatch(/saída 1 de "f" já está ligada/);
    expect(invalid(edges("  - { from: a, to: f, output: 1 }\n"))).toMatch(
      /só um nó de função tem saídas numeradas/,
    );
    expect(
      invalid(edges("  - { from: f, to: a, output: 1 }\n  - { from: f, to: a, output: 2 }\n")),
    ).toBe("VALID");
  });

  it("migrates a v1 linear flow to v2 without losing anything", () => {
    const result = validateFlow(FLOW_V1);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.wttp).toBe(2);
    // Mesmos nós, mesmas requests, mesmas posições, mesmos mapeamentos, na mesma ordem.
    expect(result.value.nodes.map(node => [node.id, node.request, node.x, node.y])).toEqual([
      ["login", "auth/login.req.yaml", 0, 0],
      ["create", "users/create.req.yaml", 280, 40],
      ["fetch", "users/get.req.yaml", 560, 0],
    ]);
    expect(result.value.nodes.every(node => node.type === "request")).toBe(true);
    expect(result.value.edges).toEqual([
      { from: "login", to: "create" },
      { from: "create", to: "fetch" },
    ]);
    expect(result.value.mappings).toHaveLength(3);
    // E salvar grava o v2 canônico.
    expect(serializeFlow(result.value)).toBe(FLOW_V2);
  });

  it("migrates an empty and a single-node v1 flow", () => {
    expect(parseFlow("wttp: 1\nname: Empty\nnodes: []\n")).toMatchObject({ wttp: 2, nodes: [] });
    const single = parseFlow("name: One\nnodes:\n  - { id: a, request: a.req.yaml }\n");
    expect(single.nodes).toEqual([{ id: "a", type: "request", request: "a.req.yaml" }]);
    expect(single.edges).toBeUndefined();
  });

  it("preserves unknown fields", () => {
    const raw = `${FLOW_V2}future:\n  a: 1\n`;
    const result = validateFlow(raw);
    expect(result.valid).toBe(true);
    if (result.valid) expect(serializeFlow(result.value)).toBe(raw);
  });

  it("orders keys canonically and omits empty optional fields", () => {
    const flow: FlowFile = {
      nodes: [{ request: "a.req.yaml", y: 3, type: "request", id: "a" }],
      name: "Order",
      wttp: 2,
    };
    expect(serializeFlow(flow)).toBe(
      "wttp: 2\nname: Order\nnodes:\n  - { id: a, type: request, request: a.req.yaml, y: 3 }\n",
    );
  });

  it("reports invalid ids, requests, mappings and unknown nodes with a line (v1)", () => {
    const result = validateFlow(`wttp: 1
name: Bad
nodes:
  - { id: "a b", request: x.req.yaml }
  - { id: ok, request: notarequest.txt }
  - { id: ok, request: y.req.yaml }
mappings:
  - { from: nope.res.status, to: v }
  - { from: ok.res.nothing, to: v }
  - { from: ok.res.status, to: "9bad" }
`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    const messages = result.issues.map(issue => issue.message).join("\n");
    expect(messages).toMatch(/"id" deve usar só letras/);
    expect(messages).toMatch(/\*\.req\.yaml/);
    expect(messages).toMatch(/aparece em mais de um nó/);
    expect(messages).toMatch(/nó "nope", que não existe/);
    expect(messages).toMatch(/"from" deve ser/);
    expect(messages).toMatch(/nome de variável válido/);
    expect(result.issues.every(issue => issue.line !== undefined)).toBe(true);
  });

  const invalid = (body: string): string =>
    (() => {
      const result = validateFlow(`wttp: 2\nname: T\n${body}`);
      return result.valid ? "VALID" : result.issues.map(issue => issue.message).join("\n");
    })();

  it("validates the control nodes and the graph (v2)", () => {
    expect(invalid("nodes:\n  - { id: a, type: wat }\n")).toMatch(/tipo de nó válido/);
    expect(invalid("nodes:\n  - { id: c, type: condition }\n")).toMatch(/"when" é obrigatório/);
    expect(
      invalid("nodes:\n  - { id: c, type: condition, when: { source: body, op: eq, value: x } }\n"),
    ).toMatch(/"path" é obrigatório/);
    expect(
      invalid(
        "nodes:\n  - { id: p, type: pollUntil, when: { source: assertions }, intervalMs: 200, maxAttempts: 3 }\n",
      ),
    ).toMatch(/no mínimo 1000/);
    expect(
      invalid(
        "nodes:\n  - { id: p, type: pollUntil, when: { source: assertions }, intervalMs: 1000 }\n",
      ),
    ).toMatch(/"maxAttempts" é obrigatório/);
    expect(invalid("nodes:\n  - { id: d, type: delay, ms: -1 }\n")).toMatch(/entre 0 e/);
    expect(
      invalid(
        "nodes:\n  - { id: a, type: request, request: a.req.yaml }\nedges:\n  - { from: a, to: ghost }\n",
      ),
    ).toMatch(/"to" cita o nó "ghost"/);
    expect(
      invalid(
        "nodes:\n  - { id: a, type: request, request: a.req.yaml }\n  - { id: b, type: request, request: b.req.yaml }\n  - { id: c, type: request, request: c.req.yaml }\nedges:\n  - { from: a, to: b }\n  - { from: a, to: c }\n",
      ),
    ).toMatch(/já tem uma saída/);
    expect(
      invalid(
        "nodes:\n  - { id: c, type: condition, when: { source: assertions } }\n  - { id: a, type: request, request: a.req.yaml }\nedges:\n  - { from: c, to: a }\n",
      ),
    ).toMatch(/"when: true" ou "when: false"/);
    expect(
      invalid(
        "nodes:\n  - { id: a, type: request, request: a.req.yaml }\n  - { id: b, type: request, request: b.req.yaml }\nedges:\n  - { from: a, to: b, when: true }\n",
      ),
    ).toMatch(/só um nó de condição/);
    expect(invalid("start: nope\nnodes:\n  - { id: a, type: delay, ms: 1 }\n")).toMatch(
      /"start" cita o nó "nope"/,
    );
    expect(invalid("maxSteps: 0\nnodes: []\n")).toMatch(/"maxSteps"/);
    expect(
      invalid(
        "nodes:\n  - { id: d, type: delay, ms: 1 }\nmappings:\n  - { from: d.res.status, to: v }\n",
      ),
    ).toMatch(/não é um nó de request/);
  });

  it("refuses a flow from a newer schema", () => {
    const result = validateFlow("wttp: 3\nname: Future\nnodes: []\n");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0].message).toMatch(/versão 3/);
  });
});

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wttp-flows-"));
  await initWorkspace(root, "Flows");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("flow storage", () => {
  it("creates, saves, lists, renames and deletes — and scanWorkspace sees them", async () => {
    const created = await createFlow(root, "Login and fetch");
    expect(created.path).toBe("login-and-fetch.flow.yaml");
    expect((await createFlow(root, "Login and fetch")).path).toBe("login-and-fetch-2.flow.yaml");

    await writeFlow(root, created.path, {
      ...created.data!,
      nodes: [{ id: "a", type: "request", request: "api/a.req.yaml" }],
    });
    expect(await readFile(join(root, "flows", created.path), "utf-8")).toBe(
      "wttp: 2\nname: Login and fetch\nnodes:\n  - { id: a, type: request, request: api/a.req.yaml }\n",
    );

    const tree = await scanWorkspace(root);
    expect(tree.flows?.map(flow => flow.path)).toEqual([
      "login-and-fetch-2.flow.yaml",
      "login-and-fetch.flow.yaml",
    ]);
    // `flows/` nunca vira collection.
    expect(tree.children).toEqual([]);

    const renamed = await renameFlow(root, created.path, "Smoke test");
    expect(renamed.path).toBe("smoke-test.flow.yaml");
    expect((await listFlows(root)).map(flow => flow.name)).toEqual([
      "Login and fetch",
      "Smoke test",
    ]);

    await deleteFlow(root, renamed.path);
    expect((await listFlows(root)).map(flow => flow.path)).toEqual(["login-and-fetch-2.flow.yaml"]);
  });

  it("reads a v1 file and upgrades it to v2 on the first save", async () => {
    const created = await createFlow(root, "Old");
    await writeFile(join(root, "flows", created.path), FLOW_V1);
    const listed = (await listFlows(root)).find(flow => flow.path === created.path)!;
    expect(listed.data?.wttp).toBe(2);
    await writeFlow(root, created.path, listed.data!);
    expect(await readFile(join(root, "flows", created.path), "utf-8")).toBe(FLOW_V2);
  });

  it("lists an invalid flow with its issues instead of dropping it", async () => {
    await createFlow(root, "Fine");
    await writeFile(join(root, "flows", "broken.flow.yaml"), "wttp: 2\nname: [oops\n");
    const broken = (await listFlows(root)).find(flow => flow.path === "broken.flow.yaml");
    expect(broken?.data).toBeNull();
    expect(broken?.issues?.length).toBeGreaterThan(0);
  });

  it("refuses paths that escape flows/ and saving an invalid flow", async () => {
    await expect(
      writeFlow(root, "../x.flow.yaml", { wttp: 2, name: "x", nodes: [] }),
    ).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
    const created = await createFlow(root, "A");
    await expect(
      writeFlow(root, created.path, {
        wttp: 2,
        name: "A",
        nodes: [{ id: "bad id", type: "request", request: "a.req.yaml" }],
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
});

describe("references follow renames and moves", () => {
  async function flowWith(requests: string[]): Promise<string> {
    const created = await createFlow(root, "Refs");
    await writeFlow(root, created.path, {
      ...created.data!,
      nodes: [
        ...requests.map((request, index) => ({
          id: `n${index}`,
          type: "request" as const,
          request,
        })),
        { id: "pause", type: "delay" as const, ms: 10 },
      ],
    });
    return created.path;
  }

  it("rewrites the request when it is renamed in the tree", async () => {
    const api = (await createNode(root, "", "folder", "API")) as FolderNode;
    const login = (await createNode(root, api.path, "request", "Login")) as RequestNode;
    const flow = await flowWith([login.path, "other/x.req.yaml"]);

    const renamed = await renameNode(root, login.path, "Sign in");

    const item = (await listFlows(root)).find(candidate => candidate.path === flow)!;
    expect(item.data?.nodes.map(node => node.request)).toEqual([
      renamed.path,
      "other/x.req.yaml",
      undefined,
    ]);
    expect(renamed.path).toBe("api/sign-in.req.yaml");
  });

  it("rewrites every request under a renamed or moved folder", async () => {
    const api = (await createNode(root, "", "folder", "API")) as FolderNode;
    const v1 = (await createNode(root, "", "folder", "V1")) as FolderNode;
    const login = (await createNode(root, api.path, "request", "Login")) as RequestNode;
    const flow = await flowWith([login.path]);

    const renamed = await renameNode(root, api.path, "Backend");
    let item = (await listFlows(root)).find(candidate => candidate.path === flow)!;
    expect(item.data?.nodes[0].request).toBe("backend/login.req.yaml");

    await moveNodeInto(root, "backend/login.req.yaml", v1.path, 1);
    item = (await listFlows(root)).find(candidate => candidate.path === flow)!;
    expect(item.data?.nodes[0].request).toBe("v1/login.req.yaml");
    expect(renamed.path).toBe("backend");
  });

  it("leaves a flow untouched when nothing it cites moved", async () => {
    const flow = await flowWith(["a/a.req.yaml"]);
    const before = await readFile(join(root, "flows", flow), "utf-8");
    await rewriteFlowReferences(root, "b/b.req.yaml", "c/c.req.yaml");
    expect(await readFile(join(root, "flows", flow), "utf-8")).toBe(before);
  });
});

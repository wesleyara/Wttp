import type { HttpRequestSpec, HttpResponseSuccess, ScriptRunSpec } from "@shared";

import { describe, expect, it } from "vitest";

import { executeScript } from "./api";

const baseReq: HttpRequestSpec = {
  requestId: "r1",
  method: "GET",
  url: "https://api.example.com",
  query: [],
  headers: [],
  auth: { type: "none" },
  body: { type: "none" },
};

function jsonResponse(body: unknown, status = 200): HttpResponseSuccess {
  return {
    ok: true,
    requestId: "r1",
    status,
    statusText: "OK",
    headers: [{ name: "Content-Type", value: "application/json", enabled: true }],
    body: new TextEncoder().encode(JSON.stringify(body)),
    charset: "utf-8",
    size: { headersSent: 0, bodySent: 0, headersReceived: 0, bodyReceived: 0 },
    timing: { dns: 0, connect: 0, tls: 0, ttfb: 0, download: 0, total: 0 },
  };
}

/** Base comum de `ScriptRunSpec` — a maioria dos testes só se importa com `code`/`phase`. */
function specFor(
  overrides: Partial<ScriptRunSpec> & Pick<ScriptRunSpec, "code" | "phase">,
): ScriptRunSpec {
  return {
    envVars: {},
    collectionVars: {},
    ...overrides,
  };
}

describe("executeScript — wttp.setVar/getVar (environment ativo)", () => {
  it("carries vars set by the script back out, as strings", () => {
    const spec = specFor({
      code: 'wttp.setVar("count", 1); wttp.setVar("name", "ok");',
      phase: "preRequest",
      req: baseReq,
    });
    const result = executeScript(spec);
    expect(result.ok).toBe(true);
    expect(result.envVars).toEqual({ count: "1", name: "ok" });
  });

  it("exposes existing vars to getVar", () => {
    const spec = specFor({
      code: 'wttp.setVar("seen", wttp.getVar("token"));',
      phase: "preRequest",
      envVars: { token: "abc" },
      req: baseReq,
    });
    const result = executeScript(spec);
    expect(result.envVars?.seen).toBe("abc");
  });

  it("fails clearly when there's no active environment to write into", () => {
    const spec = specFor({
      code: 'wttp.setVar("x", "1");',
      phase: "preRequest",
      envVars: null,
      req: baseReq,
    });
    const result = executeScript(spec);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/no active environment/i);
  });

  it("getVar on a missing name (no active environment) returns undefined instead of throwing", () => {
    const spec = specFor({
      code: 'wttp.setVar("ok", wttp.getVar("missing") === undefined ? "yes" : "no");',
      phase: "preRequest",
      req: baseReq,
    });
    const result = executeScript(spec);
    expect(result.ok).toBe(true);
    expect(result.envVars?.ok).toBe("yes");
  });
});

describe("executeScript — wttp.setCollectionVar/getCollectionVar", () => {
  it("carries collection vars set by the script back out", () => {
    const spec = specFor({
      code: 'wttp.setCollectionVar("base_url", "https://staging.example.com");',
      phase: "preRequest",
      req: baseReq,
    });
    const result = executeScript(spec);
    expect(result.ok).toBe(true);
    expect(result.collectionVars).toEqual({ base_url: "https://staging.example.com" });
  });

  it("exposes existing collection vars to getCollectionVar", () => {
    const spec = specFor({
      code: 'wttp.setVar("seen", wttp.getCollectionVar("scope"));',
      phase: "preRequest",
      collectionVars: { scope: "openid" },
      req: baseReq,
    });
    const result = executeScript(spec);
    expect(result.envVars?.seen).toBe("openid");
  });

  it("fails clearly when the request isn't inside any collection", () => {
    const spec = specFor({
      code: 'wttp.setCollectionVar("x", "1");',
      phase: "preRequest",
      collectionVars: null,
      req: baseReq,
    });
    const result = executeScript(spec);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/isn't inside a collection/i);
  });
});

describe("executeScript — req mutation (preRequest)", () => {
  it("lets the pre-request script mutate req, reflected in the request actually sent", () => {
    const spec = specFor({
      code: 'req.headers.push({ name: "X-Test", value: "1", enabled: true });',
      phase: "preRequest",
      req: baseReq,
    });
    const result = executeScript(spec);
    expect(result.req?.headers).toEqual([{ name: "X-Test", value: "1", enabled: true }]);
    // não muta o objeto original recebido
    expect(baseReq.headers).toEqual([]);
  });
});

describe("executeScript — res is frozen in tests phase", () => {
  it("ignores an attempted mutation — res stays exactly what the UI already showed", () => {
    const spec = specFor({
      code: 'res.status = 999; test("res unaffected", () => expect(res.status).toBe(200));',
      phase: "tests",
      res: jsonResponse({ token: "jwt" }),
    });
    const result = executeScript(spec);
    expect(result.ok).toBe(true);
    expect(result.assertions[0].passed).toBe(true);
  });

  it("parses a JSON body into res.json", () => {
    const spec = specFor({
      code: 'test("has token", () => expect(res.json.token).toBe("jwt"));',
      phase: "tests",
      res: jsonResponse({ token: "jwt" }),
    });
    const result = executeScript(spec);
    expect(result.assertions).toEqual([
      expect.objectContaining({ name: "has token", passed: true }),
    ]);
  });
});

describe("executeScript — test/expect", () => {
  it("reports a failing assertion with expected vs received", () => {
    const spec = specFor({
      code: 'test("status is 200", () => expect(res.status).toBe(200));',
      phase: "tests",
      res: jsonResponse({}, 404),
    });
    const result = executeScript(spec);
    expect(result.assertions[0]).toMatchObject({ name: "status is 200", passed: false });
    expect(result.assertions[0].message).toContain("404");
    expect(result.assertions[0].message).toContain("200");
  });

  it("covers all documented matchers", () => {
    const spec = specFor({
      code: `
        test("toBe", () => expect(1).toBe(1));
        test("toEqual", () => expect({ a: 1 }).toEqual({ a: 1 }));
        test("toBeTruthy", () => expect("x").toBeTruthy());
        test("toContain", () => expect([1, 2]).toContain(2));
        test("toHaveProperty", () => expect({ a: { b: 1 } }).toHaveProperty("a.b", 1));
        test("toMatch", () => expect("hello").toMatch(/ell/));
      `,
      phase: "tests",
      res: jsonResponse({}),
    });
    const result = executeScript(spec);
    expect(result.assertions.every(a => a.passed)).toBe(true);
    expect(result.assertions).toHaveLength(6);
  });
});

describe("executeScript — console capture", () => {
  it("captures console.log/warn/error tagged with the phase", () => {
    const spec = specFor({
      code: 'console.log("a"); console.warn("b"); console.error("c");',
      phase: "preRequest",
      req: baseReq,
    });
    const result = executeScript(spec);
    expect(result.console).toEqual([
      { level: "log", message: "a", phase: "preRequest" },
      { level: "warn", message: "b", phase: "preRequest" },
      { level: "error", message: "c", phase: "preRequest" },
    ]);
  });
});

describe("executeScript — uncaught exceptions", () => {
  it("turns an uncaught exception into a script failure, not a crash", () => {
    const spec = specFor({
      code: 'throw new Error("boom");',
      phase: "preRequest",
      req: baseReq,
    });
    const result = executeScript(spec);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("boom");
  });

  it("does not fail an unrelated test just because a different test threw", () => {
    const spec = specFor({
      code: `
        test("first fails", () => { throw new Error("nope"); });
        test("second passes", () => expect(1).toBe(1));
      `,
      phase: "tests",
      res: jsonResponse({}),
    });
    const result = executeScript(spec);
    expect(result.ok).toBe(true);
    expect(result.assertions).toEqual([
      expect.objectContaining({ name: "first fails", passed: false }),
      expect.objectContaining({ name: "second passes", passed: true }),
    ]);
  });
});

describe("fase function (nó de função de um flow)", () => {
  const run = (
    code: string,
    extra: Partial<ScriptRunSpec> = {},
  ): ReturnType<typeof executeScript> =>
    executeScript(
      specFor({
        code,
        phase: "function",
        outputs: 3,
        vars: { token: "abc" },
        res: jsonResponse({ job: { state: "done" }, count: 7 }, 201),
        ...extra,
      }),
    );

  it("a number picks the output to follow", () => {
    expect(run("return 2;")).toMatchObject({ ok: true, output: 2 });
    expect(run("return res.status === 201 ? 3 : 1;")).toMatchObject({ ok: true, output: 3 });
  });

  it("an array, Node-RED style, picks the first position that isn't null", () => {
    expect(run("return [null, { a: 1 }, 'x'];")).toMatchObject({ ok: true, output: 2 });
    expect(run("return [null, null, null];")).toMatchObject({ ok: true, output: null });
  });

  it("returning nothing follows no output — the flow ends there", () => {
    expect(run("const x = 1;")).toMatchObject({ ok: true, output: null });
    expect(run("return null;")).toMatchObject({ ok: true, output: null });
  });

  it("reads the last response and reads/writes the flow variables as text", () => {
    const result = run(
      "vars.state = res.json.job.state; vars.total = res.json.count * 2; delete vars.token; return 1;",
    );
    expect(result).toMatchObject({ ok: true, output: 1, vars: { state: "done", total: "14" } });
    expect(result.vars).not.toHaveProperty("token");
  });

  it("sees the variables the flow already had", () => {
    expect(run("return vars.token === 'abc' ? 2 : 1;")).toMatchObject({ output: 2 });
  });

  it("works without a response (the function runs before any request)", () => {
    expect(run("return res === undefined ? 1 : 2;", { res: undefined })).toMatchObject({
      ok: true,
      output: 1,
    });
  });

  it("captures console output and assertions, tagged with the phase", () => {
    const result = run(
      "console.log('hi'); test('ok', () => expect(res.status).toBe(201)); return 1;",
    );
    expect(result.console).toEqual([{ level: "log", message: "hi", phase: "function" }]);
    expect(result.assertions).toMatchObject([{ name: "ok", passed: true }]);
  });

  it("fails clearly on an output that doesn't exist, a bad type and a fractional number", () => {
    expect(run("return 4;").error?.message).toMatch(/chose output 4, but this node has 3 outputs/);
    expect(run("return 0;").error?.message).toMatch(/chose output 0/);
    expect(run("return 'a';").error?.message).toMatch(/returned string/);
    expect(run("return 1.5;").error?.message).toMatch(/whole output number/);
    expect(run("return [null, null, null, 'x'];", { outputs: 3 }).error?.message).toMatch(
      /chose output 4/,
    );
  });

  it("reports syntax errors and thrown errors, keeping the variables written until then", () => {
    expect(run("return (;")).toMatchObject({ ok: false });
    const thrown = run("vars.before = 'yes'; throw new Error('boom');");
    expect(thrown).toMatchObject({ ok: false, vars: { before: "yes" } });
    expect(thrown.error?.message).toMatch(/boom/);
  });

  it("times out an endless loop", () => {
    expect(run("while (true) {}", { timeoutMs: 50 })).toMatchObject({
      ok: false,
      error: { code: "SCRIPT_TIMEOUT" },
    });
  });

  it("has no access to require, process or the file system", () => {
    expect(
      run("return typeof require === 'undefined' && typeof process === 'undefined' ? 1 : 2;"),
    ).toMatchObject({ output: 1 });
  });
});

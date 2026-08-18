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

describe("executeScript — wttp.setVar/getVar", () => {
  it("carries runtime vars set by the script back out, as strings", () => {
    const spec: ScriptRunSpec = {
      code: 'wttp.setVar("count", 1); wttp.setVar("name", "ok");',
      phase: "preRequest",
      vars: {},
      req: baseReq,
    };
    const result = executeScript(spec);
    expect(result.ok).toBe(true);
    expect(result.vars).toEqual({ count: "1", name: "ok" });
  });

  it("exposes existing vars to getVar", () => {
    const spec: ScriptRunSpec = {
      code: 'wttp.setVar("seen", wttp.getVar("token"));',
      phase: "preRequest",
      vars: { token: "abc" },
      req: baseReq,
    };
    const result = executeScript(spec);
    expect(result.vars.seen).toBe("abc");
  });
});

describe("executeScript — req mutation (preRequest)", () => {
  it("lets the pre-request script mutate req, reflected in the request actually sent", () => {
    const spec: ScriptRunSpec = {
      code: 'req.headers.push({ name: "X-Test", value: "1", enabled: true });',
      phase: "preRequest",
      vars: {},
      req: baseReq,
    };
    const result = executeScript(spec);
    expect(result.req?.headers).toEqual([{ name: "X-Test", value: "1", enabled: true }]);
    // não muta o objeto original recebido
    expect(baseReq.headers).toEqual([]);
  });
});

describe("executeScript — res is frozen in tests phase", () => {
  it("ignores an attempted mutation — res stays exactly what the UI already showed", () => {
    const spec: ScriptRunSpec = {
      code: 'res.status = 999; test("res unaffected", () => expect(res.status).toBe(200));',
      phase: "tests",
      vars: {},
      res: jsonResponse({ token: "jwt" }),
    };
    const result = executeScript(spec);
    expect(result.ok).toBe(true);
    expect(result.assertions[0].passed).toBe(true);
  });

  it("parses a JSON body into res.json", () => {
    const spec: ScriptRunSpec = {
      code: 'test("has token", () => expect(res.json.token).toBe("jwt"));',
      phase: "tests",
      vars: {},
      res: jsonResponse({ token: "jwt" }),
    };
    const result = executeScript(spec);
    expect(result.assertions).toEqual([
      expect.objectContaining({ name: "has token", passed: true }),
    ]);
  });
});

describe("executeScript — test/expect", () => {
  it("reports a failing assertion with expected vs received", () => {
    const spec: ScriptRunSpec = {
      code: 'test("status is 200", () => expect(res.status).toBe(200));',
      phase: "tests",
      vars: {},
      res: jsonResponse({}, 404),
    };
    const result = executeScript(spec);
    expect(result.assertions[0]).toMatchObject({ name: "status is 200", passed: false });
    expect(result.assertions[0].message).toContain("404");
    expect(result.assertions[0].message).toContain("200");
  });

  it("covers all documented matchers", () => {
    const spec: ScriptRunSpec = {
      code: `
        test("toBe", () => expect(1).toBe(1));
        test("toEqual", () => expect({ a: 1 }).toEqual({ a: 1 }));
        test("toBeTruthy", () => expect("x").toBeTruthy());
        test("toContain", () => expect([1, 2]).toContain(2));
        test("toHaveProperty", () => expect({ a: { b: 1 } }).toHaveProperty("a.b", 1));
        test("toMatch", () => expect("hello").toMatch(/ell/));
      `,
      phase: "tests",
      vars: {},
      res: jsonResponse({}),
    };
    const result = executeScript(spec);
    expect(result.assertions.every(a => a.passed)).toBe(true);
    expect(result.assertions).toHaveLength(6);
  });
});

describe("executeScript — console capture", () => {
  it("captures console.log/warn/error tagged with the phase", () => {
    const spec: ScriptRunSpec = {
      code: 'console.log("a"); console.warn("b"); console.error("c");',
      phase: "preRequest",
      vars: {},
      req: baseReq,
    };
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
    const spec: ScriptRunSpec = {
      code: 'throw new Error("boom");',
      phase: "preRequest",
      vars: {},
      req: baseReq,
    };
    const result = executeScript(spec);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("boom");
  });

  it("does not fail an unrelated test just because a different test threw", () => {
    const spec: ScriptRunSpec = {
      code: `
        test("first fails", () => { throw new Error("nope"); });
        test("second passes", () => expect(1).toBe(1));
      `,
      phase: "tests",
      vars: {},
      res: jsonResponse({}),
    };
    const result = executeScript(spec);
    expect(result.ok).toBe(true);
    expect(result.assertions).toEqual([
      expect.objectContaining({ name: "first fails", passed: false }),
      expect.objectContaining({ name: "second passes", passed: true }),
    ]);
  });
});

import { describe, expect, it } from "vitest";

import {
  type Condition,
  type ConditionInput,
  describeCondition,
  evaluateCondition,
} from "./condition";
import {
  extractValue,
  formatMappingSource,
  listBodyFields,
  parseMappingSource,
  toJsonPath,
  variableNamesIn,
} from "./flowMapping";

const input = (over: Partial<ConditionInput> = {}): ConditionInput => ({
  response: {
    status: 201,
    headers: [{ name: "Location", value: "/jobs/7" }],
    body: JSON.stringify({ job: { state: "done", progress: 100, tags: ["a"] } }),
  },
  assertions: [],
  ...over,
});

describe("evaluateCondition", () => {
  const cases: [string, Condition, boolean][] = [
    ["status eq", { source: "status", op: "eq", value: "201" }, true],
    ["status eq miss", { source: "status", op: "eq", value: "200" }, false],
    ["status gte", { source: "status", op: "gte", value: "200" }, true],
    ["status lt", { source: "status", op: "lt", value: "200" }, false],
    ["body eq", { source: "body", path: "job.state", op: "eq", value: "done" }, true],
    ["body jsonpath", { source: "body", path: "$.job.state", op: "eq", value: "done" }, true],
    ["body number gt", { source: "body", path: "job.progress", op: "gt", value: "99" }, true],
    ["body contains", { source: "body", path: "job.state", op: "contains", value: "on" }, true],
    ["body neq", { source: "body", path: "job.state", op: "neq", value: "done" }, false],
    ["body exists", { source: "body", path: "job.tags[0]", op: "exists" }, true],
    ["body missing exists", { source: "body", path: "job.nope", op: "exists" }, false],
    ["body notExists", { source: "body", path: "job.nope", op: "notExists" }, true],
    ["header eq", { source: "header", path: "location", op: "eq", value: "/jobs/7" }, true],
    ["header exists", { source: "header", path: "X-Nope", op: "exists" }, false],
  ];
  it.each(cases)("%s", (_name, condition, expected) => {
    expect(evaluateCondition(condition, input())).toBe(expected);
  });

  it("compares numbers only when both sides are numbers", () => {
    expect(
      evaluateCondition({ source: "body", path: "job.state", op: "gt", value: "1" }, input()),
    ).toBe(false);
    expect(evaluateCondition({ source: "status", op: "gt", value: "" }, input())).toBe(false);
  });

  it("assertions: needs at least one, and all of them passed", () => {
    const condition: Condition = { source: "assertions" };
    expect(evaluateCondition(condition, input())).toBe(false);
    expect(evaluateCondition(condition, input({ assertions: [{ passed: true }] }))).toBe(true);
    expect(
      evaluateCondition(condition, input({ assertions: [{ passed: true }, { passed: false }] })),
    ).toBe(false);
  });

  it("without a response, only notExists holds", () => {
    const none = input({ response: null });
    expect(evaluateCondition({ source: "status", op: "eq", value: "200" }, none)).toBe(false);
    expect(evaluateCondition({ source: "body", path: "a", op: "notExists" }, none)).toBe(true);
  });

  it("never runs code: a hostile path or value is just text", () => {
    expect(
      evaluateCondition(
        { source: "body", path: "constructor.constructor('return 1')()", op: "exists" },
        input(),
      ),
    ).toBe(false);
  });

  it("describes a condition in one line", () => {
    expect(describeCondition({ source: "status", op: "eq", value: "201" })).toBe("status == 201");
    expect(describeCondition({ source: "assertions" })).toBe("assertions passed");
    expect(describeCondition({ source: "body", path: "a.b", op: "exists" })).toBe(
      "body a.b exists",
    );
  });
});

describe("flow mapping helpers", () => {
  it("parses and formats every kind of source", () => {
    expect(parseMappingSource("login.res.body.data.token")).toEqual({
      nodeId: "login",
      kind: "body",
      path: "data.token",
    });
    expect(parseMappingSource("a-1.res.headers.Content-Type")).toEqual({
      nodeId: "a-1",
      kind: "header",
      name: "Content-Type",
    });
    expect(parseMappingSource("x.res.status")).toEqual({ nodeId: "x", kind: "status" });
    for (const bad of [
      "x.res.nothing",
      "res.status",
      "a b.res.status",
      "x.res.body.",
      "x.res.headers.",
    ]) {
      expect(parseMappingSource(bad)).toBeNull();
    }
    expect(formatMappingSource("n", { kind: "body", path: "a[0].b" })).toBe("n.res.body.a[0].b");
  });

  it("builds JSONPath from the file notation", () => {
    expect(toJsonPath("data.token")).toBe("$.data.token");
    expect(toJsonPath('["x-y"].z')).toBe('$["x-y"].z');
    expect(toJsonPath("$.a")).toBe("$.a");
  });

  it("extracts values as text and explains what is missing", () => {
    const view = {
      status: 200,
      headers: [{ name: "X-Id", value: "9" }],
      body: JSON.stringify({ id: 7, ok: true, nested: { a: [1] }, "x-y": "dash" }),
    };
    const get = (path: string): unknown => extractValue({ kind: "body", path }, view);
    expect(get("id")).toEqual({ ok: true, value: "7" });
    expect(get("ok")).toEqual({ ok: true, value: "true" });
    expect(get("nested")).toEqual({ ok: true, value: '{"a":[1]}' });
    expect(get('["x-y"]')).toEqual({ ok: true, value: "dash" });
    expect(get("nope")).toMatchObject({ ok: false });
    expect(extractValue({ kind: "header", name: "x-id" }, view)).toEqual({ ok: true, value: "9" });
    expect(extractValue({ kind: "body", path: "a" }, { ...view, body: "plain" })).toEqual({
      ok: false,
      message: "the response body is not JSON",
    });
  });

  it("lists body fields as ports, with the first array item", () => {
    expect(
      listBodyFields({ data: { token: "abc", items: [{ id: 1 }, { id: 2 }] }, "x-y": 1 }),
    ).toEqual([
      { path: "data.token", preview: "abc" },
      { path: "data.items[0].id", preview: "1" },
      { path: '["x-y"]', preview: "1" },
    ]);
    expect(listBodyFields({ a: { b: { c: { d: { e: 1 } } } } }, 3)).toEqual([
      { path: "a.b.c", preview: "{…}" },
    ]);
    expect(listBodyFields("text")).toEqual([]);
  });

  it("finds the variables a text uses, without the dynamic ones", () => {
    expect(variableNamesIn("{{base}}/u/{{ id }}?t={{$uuid}}&b={{base}}")).toEqual(["base", "id"]);
  });
});

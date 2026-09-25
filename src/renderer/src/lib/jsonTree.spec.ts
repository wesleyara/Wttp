import { describe, expect, it } from "vitest";

import {
  accessorFor,
  appendScriptLine,
  assertionLine,
  CHILD_PAGE_SIZE,
  defaultExpanded,
  displayPath,
  flattenTree,
  type Json,
  rowId,
  setVarLine,
  suggestVarName,
} from "./jsonTree";

describe("accessorFor / displayPath", () => {
  it("uses dots, indexes and bracket notation for non-identifier keys", () => {
    const path = ["data", "items", 0, "content-type", "a b"];
    expect(accessorFor(path)).toBe('.data.items[0]["content-type"]["a b"]');
    expect(displayPath(["data", "items", 0, "id"])).toBe("data.items[0].id");
    expect(displayPath([])).toBe("$");
    expect(displayPath([0, "x"])).toBe("[0].x");
  });
});

describe("suggestVarName", () => {
  it("derives an identifier from the last key", () => {
    expect(suggestVarName(["data", "access-token"])).toBe("access_token");
    expect(suggestVarName(["items", 0])).toBe("items");
    expect(suggestVarName([])).toBe("value");
    expect(suggestVarName(["1st"])).toBe("_1st");
  });
});

describe("script lines", () => {
  it("appends to the end of an existing script without touching it", () => {
    expect(appendScriptLine(undefined, "a();")).toBe("a();\n");
    expect(appendScriptLine("x();\n\n", "a();")).toBe("x();\na();\n");
    expect(appendScriptLine("x();", "a();")).toBe("x();\na();\n");
  });

  it("builds setVar and assertion lines (res.json is a property, expect lives in test)", () => {
    expect(setVarLine("token", ["data", "token"])).toBe(
      'wttp.setVar("token", res.json.data.token);',
    );
    expect(assertionLine(["id"], 3, "equals")).toBe(
      'test("id matches", () => expect(res.json.id).toBe(3));',
    );
    expect(assertionLine(["tags"], ["a"], "equals")).toContain('.toEqual(["a"])');
    expect(assertionLine(["token"], "x", "truthy")).toContain(".toBeTruthy()");
    expect(assertionLine(["big"], "x".repeat(400), "equals")).toBeNull();
  });
});

describe("flattenTree", () => {
  const doc: Json = { a: { b: [1, 2, 3] }, c: "x" };

  it("only shows the root's children until something is expanded", () => {
    const rows = flattenTree(doc, defaultExpanded());
    expect(rows.map(r => r.label)).toEqual([null, "a", "c"]);
    expect(rows[1].summary).toBe("{1}");
  });

  it("descends into expanded nodes", () => {
    const expanded = defaultExpanded();
    expanded.add(rowId(["a"]));
    expanded.add(rowId(["a", "b"]));
    expect(flattenTree(doc, expanded).map(r => r.label)).toEqual([
      null,
      "a",
      "b",
      "0",
      "1",
      "2",
      "c",
    ]);
  });

  it("pages large containers instead of emitting every child", () => {
    const big: Json = Array.from({ length: 5000 }, (_, i) => i);
    const rows = flattenTree(big, defaultExpanded());
    expect(rows).toHaveLength(1 + CHILD_PAGE_SIZE + 1);
    expect(rows.at(-1)?.more?.remaining).toBe(5000 - CHILD_PAGE_SIZE);
    const more = flattenTree(big, defaultExpanded(), new Map([[rowId([]), 300]]));
    expect(more).toHaveLength(1 + 300 + 1);
  });
});

describe("large documents", () => {
  it("flattens a ~5MB document without visiting collapsed subtrees", () => {
    const items = Array.from({ length: 110_000 }, (_, i) => ({
      id: i,
      name: `item-${i}`,
      tags: ["a", "b"],
    }));
    const text = JSON.stringify({ items });
    expect(text.length).toBeGreaterThan(5_000_000);
    const started = performance.now();
    const doc = JSON.parse(text) as Json;
    const expanded = defaultExpanded();
    expanded.add(rowId(["items"]));
    const rows = flattenTree(doc, expanded);
    expect(rows).toHaveLength(1 + 1 + CHILD_PAGE_SIZE + 1);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

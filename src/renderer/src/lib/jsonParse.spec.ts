import { describe, expect, it } from "vitest";

import { parseJsonDocument } from "./jsonParse";

describe("parseJsonDocument", () => {
  it("parses valid JSON", () => {
    expect(parseJsonDocument('{"a":[1,2]}')).toEqual({ ok: true, data: { a: [1, 2] } });
  });

  it("accepts primitives at the root", () => {
    expect(parseJsonDocument("42")).toEqual({ ok: true, data: 42 });
  });

  it("reports line and column for a syntax error on a later line", () => {
    const result = parseJsonDocument('{\n  "a": 1,\n  "b": ,\n}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.line).toBe(3);
      expect(result.column).toBeGreaterThan(0);
    }
  });

  it("reports a position for truncated input", () => {
    const result = parseJsonDocument('{"a": 1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.line).toBe(1);
  });
});

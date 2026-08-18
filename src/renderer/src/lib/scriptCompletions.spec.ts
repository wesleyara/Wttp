import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { scriptApiCompletionSource } from "./scriptCompletions";

function contextAt(
  doc: string,
  pos: number,
  explicit = false,
): Parameters<ReturnType<typeof scriptApiCompletionSource>>[0] {
  const state = EditorState.create({ doc });
  return {
    state,
    pos,
    explicit,
    matchBefore: (regexp: RegExp) => {
      const line = state.doc.lineAt(pos);
      const text = line.text.slice(0, pos - line.from);
      const match = new RegExp(regexp.source + "$").exec(text);
      if (!match) return null;
      return { from: pos - match[0].length, to: pos, text: match[0] };
    },
  } as Parameters<ReturnType<typeof scriptApiCompletionSource>>[0];
}

describe("scriptApiCompletionSource", () => {
  it("suggests only what's available in preRequest at the top level", () => {
    const source = scriptApiCompletionSource("preRequest");
    const result = source(contextAt("w", 1));
    expect(result?.options.map(o => o.label)).toEqual(
      expect.arrayContaining(["console", "req", "wttp"]),
    );
    // não oferece globals de outra fase nem snippets de tests
    expect(result?.options.map(o => o.label)).not.toEqual(
      expect.arrayContaining(["res", "test", "expect", "save-token"]),
    );
  });

  it("suggests only what's available in tests at the top level", () => {
    const source = scriptApiCompletionSource("tests");
    const result = source(contextAt("r", 1));
    expect(result?.options.map(o => o.label)).toEqual(
      expect.arrayContaining(["console", "expect", "res", "test", "wttp"]),
    );
  });

  it("completes wttp.* members", () => {
    const source = scriptApiCompletionSource("preRequest");
    const result = source(contextAt("wttp.set", 8));
    expect(result?.options.map(o => o.label)).toEqual(expect.arrayContaining(["setVar", "getVar"]));
  });

  it("completes req.* members in preRequest", () => {
    const source = scriptApiCompletionSource("preRequest");
    const result = source(contextAt("req.", 4));
    expect(result?.options.map(o => o.label)).toContain("headers");
  });

  it("does not complete res.* members in preRequest (not available in that phase)", () => {
    const source = scriptApiCompletionSource("preRequest");
    const result = source(contextAt("res.", 4));
    expect(result).toBeNull();
  });

  it("completes res.* members in tests", () => {
    const source = scriptApiCompletionSource("tests");
    const result = source(contextAt("res.", 4));
    expect(result?.options.map(o => o.label)).toEqual(
      expect.arrayContaining(["status", "json", "headers"]),
    );
  });

  it("completes expect(...) matchers after a closing paren, in tests", () => {
    const source = scriptApiCompletionSource("tests");
    const result = source(contextAt("expect(res.status).", 19));
    expect(result?.options.map(o => o.label)).toEqual(
      expect.arrayContaining([
        "toBe",
        "toEqual",
        "toBeTruthy",
        "toContain",
        "toHaveProperty",
        "toMatch",
      ]),
    );
  });

  it("does not offer expect matchers in preRequest", () => {
    const source = scriptApiCompletionSource("preRequest");
    const result = source(contextAt("req.headers.push(1).", 20));
    expect(result).toBeNull();
  });

  it("offers the set-var snippet in preRequest", () => {
    const source = scriptApiCompletionSource("preRequest");
    const result = source(contextAt("s", 1));
    expect(result?.options.map(o => o.label)).toContain("set-var");
  });

  it("offers the test-status and save-token snippets in tests", () => {
    const source = scriptApiCompletionSource("tests");
    const result = source(contextAt("t", 1));
    expect(result?.options.map(o => o.label)).toEqual(
      expect.arrayContaining(["test-status", "save-token"]),
    );
  });
});

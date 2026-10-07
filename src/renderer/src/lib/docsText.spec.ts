import { describe, expect, it } from "vitest";

import { normalizeDocs } from "./docsText";

describe("normalizeDocs", () => {
  it("drops a whitespace-only last line left by the editor's auto-indent", () => {
    expect(normalizeDocs("```mermaid\n  A --> B\n```\n  ")).toBe("```mermaid\n  A --> B\n```\n");
  });

  it("keeps indentation and trailing spaces inside the text", () => {
    const text = "line with hard break  \n    indented\nend";
    expect(normalizeDocs(text)).toBe(text);
  });

  it("leaves empty and already-clean text alone", () => {
    expect(normalizeDocs("")).toBe("");
    expect(normalizeDocs("# Title\n")).toBe("# Title\n");
  });
});

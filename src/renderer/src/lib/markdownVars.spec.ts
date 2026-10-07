import { describe, expect, it } from "vitest";

import { substituteVariablesInHtml } from "./markdownVars";

describe("substituteVariablesInHtml", () => {
  it("replaces a resolved variable with its escaped value", () => {
    const html = substituteVariablesInHtml("<p>Base: {{baseUrl}}</p>", {
      baseUrl: "https://api.test",
    });
    expect(html).toContain("https://api.test");
    expect(html).not.toContain("{{baseUrl}}");
  });

  it("escapes values so a variable cannot inject markup", () => {
    const html = substituteVariablesInHtml("<p>{{x}}</p>", { x: "<img src=x onerror=1>" });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("keeps and marks an unresolved variable", () => {
    const html = substituteVariablesInHtml("<p>{{missing}}</p>", {});
    expect(html).toContain("{{missing}}");
    expect(html).toContain("not resolved");
  });

  it("never rewrites inside a tag", () => {
    const html = substituteVariablesInHtml('<a href="{{baseUrl}}">go</a>', { baseUrl: "X" });
    expect(html).toBe('<a href="{{baseUrl}}">go</a>');
  });

  it("tolerates spaces inside the braces and leaves variable-free html alone", () => {
    expect(substituteVariablesInHtml("<p>{{ a }}</p>", { a: "1" })).toContain(">1<");
    expect(substituteVariablesInHtml("<p>plain</p>", { a: "1" })).toBe("<p>plain</p>");
  });
});

import { describe, expect, it } from "vitest";

import { isAllowedExternalUrl } from "./app";

describe("isAllowedExternalUrl", () => {
  it("permite as URLs exatas da allowlist", () => {
    expect(isAllowedExternalUrl("https://github.com/wesleyara/Wttp")).toBe(true);
    expect(isAllowedExternalUrl("https://github.com/wesleyara/Wttp/issues")).toBe(true);
    expect(isAllowedExternalUrl("https://github.com/wesleyara/Wttp/tree/main/docs")).toBe(true);
  });

  it("permite subcaminhos de uma URL permitida", () => {
    expect(isAllowedExternalUrl("https://github.com/wesleyara/Wttp/issues/42")).toBe(true);
    expect(isAllowedExternalUrl("https://github.com/wesleyara/Wttp/tree/main/docs/file.md")).toBe(
      true,
    );
  });

  it("recusa domínio diferente, mesmo parecido", () => {
    expect(isAllowedExternalUrl("https://evil.com/wesleyara/Wttp")).toBe(false);
    expect(isAllowedExternalUrl("https://github.com.evil.com/wesleyara/Wttp")).toBe(false);
  });

  it("recusa outro repositório no mesmo GitHub", () => {
    expect(isAllowedExternalUrl("https://github.com/someone-else/Wttp")).toBe(false);
  });

  it("recusa string vazia ou qualquer URL não listada", () => {
    expect(isAllowedExternalUrl("")).toBe(false);
    expect(isAllowedExternalUrl("https://example.com")).toBe(false);
  });
});

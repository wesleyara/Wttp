import { describe, expect, it } from "vitest";

import { resolveDocsLocale } from "./docsLocale";

describe("resolveDocsLocale", () => {
  it("usa a preferência explícita, ignorando o SO", () => {
    expect(resolveDocsLocale("en", "pt-BR")).toBe("en");
    expect(resolveDocsLocale("pt-BR", "en-US")).toBe("pt-BR");
  });

  it("system/ausente segue o idioma do SO, com fallback em en", () => {
    expect(resolveDocsLocale("system", "pt-PT")).toBe("pt-BR");
    expect(resolveDocsLocale(undefined, "pt-BR")).toBe("pt-BR");
    expect(resolveDocsLocale(undefined, "de-DE")).toBe("en");
  });
});

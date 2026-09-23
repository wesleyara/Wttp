import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveDocsFile } from "./docsPaths";

function makeSite(): string {
  const root = mkdtempSync(join(tmpdir(), "wttp-docs-"));
  mkdirSync(join(root, "guia"), { recursive: true });
  mkdirSync(join(root, "en"), { recursive: true });
  writeFileSync(join(root, "index.html"), "root");
  writeFileSync(join(root, "guia", "request.html"), "request");
  writeFileSync(join(root, "en", "index.html"), "en");
  writeFileSync(join(root, "app.js"), "js");
  return root;
}

describe("resolveDocsFile", () => {
  const root = makeSite();

  it("serve a raiz como index.html", () => {
    expect(resolveDocsFile(root, "/")).toBe(join(root, "index.html"));
  });

  it("resolve URL limpa para .html", () => {
    expect(resolveDocsFile(root, "/guia/request")).toBe(join(root, "guia", "request.html"));
  });

  it("resolve diretório para index.html", () => {
    expect(resolveDocsFile(root, "/en/")).toBe(join(root, "en", "index.html"));
  });

  it("serve assets por caminho exato", () => {
    expect(resolveDocsFile(root, "/app.js")).toBe(join(root, "app.js"));
  });

  it("devolve null para arquivo inexistente", () => {
    expect(resolveDocsFile(root, "/nada")).toBeNull();
  });

  it("recusa caminho que escapa da raiz", () => {
    expect(resolveDocsFile(root, "/../../etc/passwd")).toBeNull();
    expect(resolveDocsFile(root, "/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
  });
});

import type { HttpRequestSpec } from "@shared";

import { describe, expect, it } from "vitest";

import { applyAuth } from "./auth";

function baseSpec(overrides: Partial<HttpRequestSpec> = {}): HttpRequestSpec {
  return {
    requestId: "r1",
    method: "GET",
    url: "https://example.com",
    query: [],
    headers: [],
    auth: { type: "none" },
    body: { type: "none" },
    ...overrides,
  };
}

describe("applyAuth", () => {
  it("não mexe na request quando auth é none", () => {
    const spec = baseSpec({ auth: { type: "none" } });
    expect(applyAuth(spec)).toBe(spec);
  });

  it("trata inherit não resolvido como none, sem lançar erro", () => {
    const spec = baseSpec({ auth: { type: "inherit" } });
    expect(applyAuth(spec)).toBe(spec);
  });

  it("bearer vira header Authorization: Bearer <token>", () => {
    const spec = baseSpec({ auth: { type: "bearer", bearer: { token: "abc123" } } });
    const result = applyAuth(spec);
    expect(result.headers).toContainEqual({
      name: "Authorization",
      value: "Bearer abc123",
      enabled: true,
    });
  });

  it("bearer com token vazio não adiciona header", () => {
    const spec = baseSpec({ auth: { type: "bearer", bearer: { token: "" } } });
    expect(applyAuth(spec).headers).toEqual([]);
  });

  it("basic codifica user:pass em base64", () => {
    const spec = baseSpec({
      auth: { type: "basic", basic: { username: "alice", password: "wonderland" } },
    });
    const expected = `Basic ${Buffer.from("alice:wonderland", "utf-8").toString("base64")}`;
    expect(applyAuth(spec).headers).toContainEqual({
      name: "Authorization",
      value: expected,
      enabled: true,
    });
  });

  it("basic codifica corretamente senha não-ASCII (bytes UTF-8, não latin1)", () => {
    const password = "sénhá-日本語";
    const spec = baseSpec({ auth: { type: "basic", basic: { username: "bob", password } } });
    const encoded = applyAuth(spec).headers[0].value.replace("Basic ", "");
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    expect(decoded).toBe(`bob:${password}`);
  });

  it("apikey no header adiciona um header com o nome configurado", () => {
    const spec = baseSpec({
      auth: { type: "apikey", apikey: { key: "X-Api-Key", value: "secret-value", in: "header" } },
    });
    const result = applyAuth(spec);
    expect(result.headers).toContainEqual({
      name: "X-Api-Key",
      value: "secret-value",
      enabled: true,
    });
    expect(result.query).toEqual([]);
  });

  it("apikey em query adiciona um parâmetro, não um header", () => {
    const spec = baseSpec({
      auth: { type: "apikey", apikey: { key: "api_key", value: "secret-value", in: "query" } },
    });
    const result = applyAuth(spec);
    expect(result.query).toContainEqual({ name: "api_key", value: "secret-value", enabled: true });
    expect(result.headers).toEqual([]);
  });

  it("apikey sem nome de chave não adiciona nada", () => {
    const spec = baseSpec({
      auth: { type: "apikey", apikey: { key: "", value: "v", in: "header" } },
    });
    const result = applyAuth(spec);
    expect(result.headers).toEqual([]);
  });

  it("Authorization manual vence bearer configurado", () => {
    const spec = baseSpec({
      headers: [{ name: "Authorization", value: "Bearer manual-token", enabled: true }],
      auth: { type: "bearer", bearer: { token: "configured-token" } },
    });
    const result = applyAuth(spec);
    expect(result.headers).toEqual([
      { name: "Authorization", value: "Bearer manual-token", enabled: true },
    ]);
  });

  it("Authorization manual desabilitado não bloqueia a auth configurada", () => {
    const spec = baseSpec({
      headers: [{ name: "Authorization", value: "Bearer manual-token", enabled: false }],
      auth: { type: "bearer", bearer: { token: "configured-token" } },
    });
    const result = applyAuth(spec);
    expect(result.headers).toContainEqual({
      name: "Authorization",
      value: "Bearer configured-token",
      enabled: true,
    });
  });

  it("apikey ainda se aplica mesmo com Authorization manual presente", () => {
    const spec = baseSpec({
      headers: [{ name: "Authorization", value: "Bearer manual-token", enabled: true }],
      auth: { type: "apikey", apikey: { key: "X-Api-Key", value: "v", in: "header" } },
    });
    const result = applyAuth(spec);
    expect(result.headers).toContainEqual({ name: "X-Api-Key", value: "v", enabled: true });
  });

  it("não muta o spec recebido", () => {
    const spec = baseSpec({ auth: { type: "bearer", bearer: { token: "abc" } } });
    const headersBefore = spec.headers;
    applyAuth(spec);
    expect(spec.headers).toBe(headersBefore);
    expect(spec.headers).toEqual([]);
  });
});

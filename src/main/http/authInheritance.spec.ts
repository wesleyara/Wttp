import type { AuthConfig } from "@shared";

import { describe, expect, it } from "vitest";

import { resolveAuthChain } from "./authInheritance";

const bearer: AuthConfig = { type: "bearer", bearer: { token: "t" } };
const basic: AuthConfig = { type: "basic", basic: { username: "u", password: "p" } };
const none: AuthConfig = { type: "none" };
const inherit: AuthConfig = { type: "inherit" };

describe("resolveAuthChain", () => {
  it("usa a auth da própria request quando não é inherit", () => {
    expect(resolveAuthChain([bearer, basic])).toEqual({ auth: bearer, sourceIndex: 0 });
  });

  it("sobe até a primeira pasta com auth concreta quando a request herda", () => {
    expect(resolveAuthChain([inherit, inherit, basic])).toEqual({ auth: basic, sourceIndex: 2 });
  });

  it("resolve com três níveis de pasta, pasta mais próxima vencendo", () => {
    // request inherit -> pasta próxima concreta -> pasta pai concreta -> raiz da collection
    const chain = [inherit, bearer, basic, none];
    expect(resolveAuthChain(chain)).toEqual({ auth: bearer, sourceIndex: 1 });
  });

  it("none na request corta a herança, ignorando a auth da collection", () => {
    expect(resolveAuthChain([none, bearer])).toEqual({ auth: none, sourceIndex: 0 });
  });

  it("none numa pasta intermediária também corta, sem olhar além dela", () => {
    expect(resolveAuthChain([inherit, none, bearer])).toEqual({ auth: none, sourceIndex: 1 });
  });

  it("pasta sem folder.yaml (undefined) se comporta como inherit", () => {
    expect(resolveAuthChain([inherit, undefined, bearer])).toEqual({
      auth: bearer,
      sourceIndex: 2,
    });
  });

  it("nenhuma auth em lugar nenhum resolve em none, sem lançar erro", () => {
    expect(resolveAuthChain([])).toEqual({ auth: none, sourceIndex: null });
    expect(resolveAuthChain([inherit, undefined, inherit])).toEqual({
      auth: none,
      sourceIndex: null,
    });
  });
});

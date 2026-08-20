import { describe, expect, it } from "vitest";

import { getActiveWorkspaceRoot, setActiveWorkspaceRoot } from "./activeWorkspace";

describe("activeWorkspace", () => {
  it("não tem workspace ativo antes de qualquer workspace:open/workspace:create", () => {
    expect(getActiveWorkspaceRoot()).toBeNull();
  });

  it("guarda a raiz do workspace aberto para secret:get/secret:set consultarem", () => {
    setActiveWorkspaceRoot("/tmp/some-workspace");
    expect(getActiveWorkspaceRoot()).toBe("/tmp/some-workspace");
  });

  it("troca de raiz quando outro workspace é aberto", () => {
    setActiveWorkspaceRoot("/tmp/first");
    setActiveWorkspaceRoot("/tmp/second");
    expect(getActiveWorkspaceRoot()).toBe("/tmp/second");
  });
});

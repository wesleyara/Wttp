import { describe, expect, it } from "vitest";

import { DEFAULT_ACCELERATORS, findAcceleratorOwner } from "./menu";

describe("findAcceleratorOwner", () => {
  it("acha a ação que usa o padrão quando nenhuma sobrescrita existe", () => {
    expect(findAcceleratorOwner("CmdOrCtrl+N", {})).toBe("request:new");
  });

  it("considera sobrescritas, não só os padrões", () => {
    const shortcuts = { "tab:close": "CmdOrCtrl+Shift+Z" };
    expect(findAcceleratorOwner("CmdOrCtrl+Shift+Z", shortcuts)).toBe("tab:close");
  });

  it("exclui a própria ação da checagem via `excluding`", () => {
    expect(findAcceleratorOwner("CmdOrCtrl+N", {}, "request:new")).toBeNull();
  });

  it("devolve null para um acelerador livre", () => {
    expect(findAcceleratorOwner("CmdOrCtrl+Shift+Z", {})).toBeNull();
  });

  it("DEFAULT_ACCELERATORS cobre toda MenuAction sem duplicar acelerador", () => {
    const values = Object.values(DEFAULT_ACCELERATORS);
    expect(new Set(values).size).toBe(values.length);
  });
});

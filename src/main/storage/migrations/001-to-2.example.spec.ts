import { describe, expect, it } from "vitest";

import { workspaceDescriptionToSummary } from "./001-to-2.example";

describe("migrador de exemplo 1 → 2", () => {
  it("renomeia description para summary", () => {
    const migrated = workspaceDescriptionToSummary.migrate({
      wttp: 1,
      name: "My API",
      description: "internal tools",
    });

    expect(migrated).toEqual({ wttp: 1, name: "My API", summary: "internal tools" });
  });

  it("não introduz summary quando description está ausente", () => {
    const migrated = workspaceDescriptionToSummary.migrate({ wttp: 1, name: "My API" });
    expect(migrated).toEqual({ wttp: 1, name: "My API" });
  });

  it("declara o salto de versão 1 para 2", () => {
    expect(workspaceDescriptionToSummary.from).toBe(1);
    expect(workspaceDescriptionToSummary.to).toBe(2);
  });
});

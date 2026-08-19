import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceStore } from "./workspace";

const ROOT = "/workspace";

const setUiState = vi.fn<(payload: { root: string; state: unknown }) => Promise<void>>(
  async () => {},
);

beforeEach(() => {
  setActivePinia(createPinia());
  setUiState.mockClear();

  vi.stubGlobal("window", {
    wttp: {
      workspace: {
        setUiState,
        getUiState: vi.fn(),
        onChanged: vi.fn(() => () => {}),
        recent: vi.fn(async () => []),
      },
    },
  });
});

describe("useWorkspaceStore", () => {
  it("flushUiState cancela o debounce e grava na hora", async () => {
    const workspace = useWorkspaceStore();
    workspace.tree = {
      root: ROOT,
      data: { wttp: 1, name: "Test" },
      environments: [],
      children: [],
    };

    workspace.patchUiState({ activeTabPath: "a.req.yaml" });
    expect(setUiState).not.toHaveBeenCalled();

    workspace.flushUiState();
    expect(setUiState).toHaveBeenCalledTimes(1);
    expect(setUiState).toHaveBeenCalledWith({
      root: ROOT,
      state: expect.objectContaining({ activeTabPath: "a.req.yaml" }),
    });
  });

  it("flushUiState sem workspace aberto é no-op", () => {
    const workspace = useWorkspaceStore();
    workspace.flushUiState();
    expect(setUiState).not.toHaveBeenCalled();
  });

  it("flushUiState/patchUiState não escrevem .wttp/ numa pasta que não é workspace ainda (needsInit)", () => {
    const workspace = useWorkspaceStore();
    // `data: null` é o que `workspace:open` devolve para uma pasta sem `wttp.yaml` —
    // `root` já aponta pra ela (pra tela "Not a workspace yet" mostrar o caminho), mas
    // não é um workspace de verdade: gravar `.wttp/` aqui criaria a pasta no lugar
    // errado quando o usuário só estava navegando até achar a pasta certa.
    workspace.tree = { root: ROOT, data: null, environments: [], children: [] };
    expect(workspace.needsInit).toBe(true);

    workspace.patchUiState({ activeTabPath: "a.req.yaml" });
    workspace.flushUiState();

    expect(setUiState).not.toHaveBeenCalled();
  });

  it("close() grava o estado pendente antes de limpar o workspace", () => {
    const workspace = useWorkspaceStore();
    workspace.tree = {
      root: ROOT,
      data: { wttp: 1, name: "Test" },
      environments: [],
      children: [],
    };
    workspace.patchUiState({ activeTabPath: "a.req.yaml" });

    workspace.close();

    expect(setUiState).toHaveBeenCalledWith({
      root: ROOT,
      state: expect.objectContaining({ activeTabPath: "a.req.yaml" }),
    });
    expect(workspace.tree).toBeNull();
  });

  it("passes structured-clone-safe state to workspace:setUiState — reactive Pinia state must not leak across the IPC boundary", () => {
    const workspace = useWorkspaceStore();
    workspace.tree = {
      root: ROOT,
      data: { wttp: 1, name: "Test" },
      environments: [],
      children: [],
    };
    workspace.patchUiState({
      expandedPaths: ["users"],
      openTabs: [{ path: "a.req.yaml", pinned: true, kind: "request" }],
      activeTabPath: "a.req.yaml",
    });
    workspace.flushUiState();

    const call = setUiState.mock.calls.at(-1)?.[0];
    if (!call) throw new Error("expected workspace:setUiState to have been called");
    // `structuredClone` é exatamente o que a ponte do Electron (`contextBridge`) usa —
    // se isto lançar, `window.wttp.workspace.setUiState` teria rejeitado com "An object
    // could not be cloned" na aplicação real, sincronamente, no ponto de chamada.
    expect(() => structuredClone(call.state)).not.toThrow();
  });
});

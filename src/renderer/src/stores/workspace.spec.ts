import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceStore } from "./workspace";

const ROOT = "/workspace";

const setUiState = vi.fn(async () => {});

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
});

import type { RequestFile, RequestNode } from "@shared";

import { useWorkspaceStore } from "@renderer/stores/workspace";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRequestTabsStore } from "./requestTabs";

const ROOT = "/workspace";

function requestFile(name: string): RequestFile {
  return { wttp: 1, name, seq: 1, method: "GET", url: `https://example.com/${name}` };
}

function requestNode(path: string, name: string): RequestNode {
  return { kind: "request", path, name, seq: 1, data: requestFile(name) };
}

const nodeRead = vi.fn(async ({ path }: { path: string }) => {
  const name = path.replace(".req.yaml", "");
  return requestNode(path, name);
});
const nodeWrite = vi.fn(async () => {});
const setUiState = vi.fn(async () => {});

beforeEach(() => {
  setActivePinia(createPinia());
  nodeRead.mockClear();
  nodeWrite.mockClear();
  setUiState.mockClear();

  vi.stubGlobal("window", {
    wttp: {
      node: { read: nodeRead, write: nodeWrite },
      workspace: { setUiState, getUiState: vi.fn(), rescan: vi.fn() },
      http: { send: vi.fn(), cancel: vi.fn() },
      dialog: { saveFile: vi.fn() },
    },
  });

  // Simula um workspace já aberto sem passar pelo fluxo real de `workspace:open`.
  const workspace = useWorkspaceStore();
  workspace.tree = { root: ROOT, data: { wttp: 1, name: "Test" }, environments: [], children: [] };
});

describe("useRequestTabsStore", () => {
  it("abrir em preview substitui a aba de preview anterior", async () => {
    const tabs = useRequestTabsStore();

    await tabs.openPreview("a.req.yaml");
    expect(tabs.tabs.map(t => t.path)).toEqual(["a.req.yaml"]);
    expect(tabs.tabs[0].pinned).toBe(false);

    await tabs.openPreview("b.req.yaml");
    expect(tabs.tabs.map(t => t.path)).toEqual(["b.req.yaml"]);
  });

  it("editar uma aba de preview promove a pinned", async () => {
    const tabs = useRequestTabsStore();
    await tabs.openPreview("a.req.yaml");

    expect(tabs.active?.pinned).toBe(false);
    tabs.active!.url = "https://example.com/changed";
    tabs.markActiveDirty();

    expect(tabs.active?.pinned).toBe(true);
    expect(tabs.active?.dirty).toBe(true);

    // Uma segunda aba de preview não substitui mais a primeira, que virou fixa.
    await tabs.openPreview("b.req.yaml");
    expect(tabs.tabs.map(t => t.path)).toEqual(["a.req.yaml", "b.req.yaml"]);
  });

  it("fechar uma aba suja exige confirmação antes de remover", async () => {
    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");
    tabs.markActiveDirty();

    tabs.requestClose("a.req.yaml");
    expect(tabs.closeConfirmId).toBe("a.req.yaml");
    expect(tabs.tabs).toHaveLength(1);

    tabs.confirmCloseDiscard();
    expect(tabs.tabs).toHaveLength(0);
    expect(tabs.closeConfirmId).toBeNull();
  });

  it("fechar uma aba limpa não pede confirmação", async () => {
    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");

    tabs.requestClose("a.req.yaml");
    expect(tabs.closeConfirmId).toBeNull();
    expect(tabs.tabs).toHaveLength(0);
  });

  it("restaura sessão reidratando ordem, pinned e aba ativa", async () => {
    const workspace = useWorkspaceStore();
    workspace.uiState = {
      expandedPaths: [],
      openTabs: [
        { path: "b.req.yaml", pinned: true },
        { path: "a.req.yaml", pinned: false },
      ],
      activeTabPath: "a.req.yaml",
    };

    const tabs = useRequestTabsStore();
    await tabs.restoreSession();

    expect(tabs.tabs.map(t => t.path)).toEqual(["b.req.yaml", "a.req.yaml"]);
    expect(tabs.tabs[0].pinned).toBe(true);
    expect(tabs.tabs[1].pinned).toBe(false);
    expect(tabs.activeId).toBe("a.req.yaml");
  });
});

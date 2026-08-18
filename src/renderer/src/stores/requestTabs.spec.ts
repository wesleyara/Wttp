import type { FolderFile, FolderNode, RequestFile, RequestNode } from "@shared";

import { useScriptRuntimeStore } from "@renderer/stores/scriptRuntime";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isFolderTab, isRequestTab, useRequestTabsStore } from "./requestTabs";

const ROOT = "/workspace";

function requestFile(name: string): RequestFile {
  return { wttp: 1, name, seq: 1, method: "GET", url: `https://example.com/${name}` };
}

function requestNode(path: string, name: string): RequestNode {
  return { kind: "request", path, name, seq: 1, data: requestFile(name) };
}

function folderFile(name: string): FolderFile {
  return { wttp: 1, name, seq: 1 };
}

function folderNode(path: string, name: string): FolderNode {
  return { kind: "folder", path, name, seq: 1, data: folderFile(name), children: [] };
}

const nodeRead = vi.fn(async ({ path }: { path: string }) => {
  if (!path.endsWith(".req.yaml")) return folderNode(path, path);
  const name = path.replace(".req.yaml", "");
  return requestNode(path, name);
});
const nodeWrite = vi.fn(
  async (args: { root: string; path: string; node: FolderNode | RequestNode }) => args,
);
const setUiState = vi.fn(async () => {});
const httpSend = vi.fn(async () => ({ ok: true }));
const resolveRequest = vi.fn(
  async ({
    request,
  }: {
    request: { url: string; query: unknown; headers: unknown; auth: unknown; body: unknown };
  }) => ({
    ...request,
    unresolved: [] as string[],
    used: [],
    cycles: [],
  }),
);
type AuthLike = { type: string } | undefined;
const resolveAuthChain = vi.fn(async ({ chain }: { chain: AuthLike[] }) => {
  const index = chain.findIndex(auth => auth && auth.type !== "inherit");
  return index === -1
    ? { auth: { type: "none" }, sourceIndex: null }
    : { auth: chain[index], sourceIndex: index };
});
type ScriptRunSpecLike = { code: string; phase: string; vars: Record<string, string> };
type ScriptRunResultLike = {
  ok: boolean;
  vars: Record<string, string>;
  assertions: { name: string; passed: boolean; message?: string; durationMs: number }[];
  console: { level: string; message: string; phase: string }[];
};
const scriptRun = vi.fn<(spec: ScriptRunSpecLike) => Promise<ScriptRunResultLike>>(async () => ({
  ok: true,
  vars: {},
  assertions: [],
  console: [],
}));

beforeEach(() => {
  setActivePinia(createPinia());
  nodeRead.mockClear();
  nodeWrite.mockClear();
  setUiState.mockClear();
  httpSend.mockClear();
  resolveRequest.mockClear();
  resolveAuthChain.mockClear();
  scriptRun.mockClear();
  scriptRun.mockImplementation(async () => ({ ok: true, vars: {}, assertions: [], console: [] }));

  vi.stubGlobal("window", {
    wttp: {
      node: { read: nodeRead, write: nodeWrite },
      workspace: {
        setUiState,
        getUiState: vi.fn(),
        // `save`/`saveFolderTab` chamam `refreshTree()` depois de escrever — precisa
        // devolver uma árvore com o mesmo `root`, senão o watcher de `workspace.root`
        // (em `requestTabs.ts`) vê `null` e fecha todas as abas por engano.
        rescan: vi.fn(async () => ({
          root: ROOT,
          data: { wttp: 1, name: "Test" },
          environments: [],
          children: [],
        })),
      },
      http: { send: httpSend, cancel: vi.fn() },
      dialog: { saveFile: vi.fn() },
      env: { list: vi.fn(async () => []) },
      secret: { get: vi.fn(async () => null) },
      variables: { resolveText: vi.fn(), resolveRequest, resolveAuthChain },
      script: { run: scriptRun },
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
    const active = tabs.active;
    if (!isRequestTab(active)) throw new Error("expected a request tab");
    active.url = "https://example.com/changed";
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
      activeEnvironment: null,
    };

    const tabs = useRequestTabsStore();
    await tabs.restoreSession();

    expect(tabs.tabs.map(t => t.path)).toEqual(["b.req.yaml", "a.req.yaml"]);
    expect(tabs.tabs[0].pinned).toBe(true);
    expect(tabs.tabs[1].pinned).toBe(false);
    expect(tabs.activeId).toBe("a.req.yaml");
  });

  it("send() resolve variáveis antes de disparar a request (EP-06-T05)", async () => {
    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");

    await tabs.send();

    expect(resolveRequest).toHaveBeenCalledOnce();
    expect(httpSend).toHaveBeenCalledOnce();
    expect(tabs.unresolvedSendId).toBeNull();
  });

  it("send() com variável não resolvida pausa e pede confirmação em vez de disparar", async () => {
    resolveRequest.mockResolvedValueOnce({
      url: "https://example.com/{{missing}}",
      query: [],
      headers: [],
      auth: { type: "none" },
      body: { type: "none" },
      unresolved: ["missing"],
      used: [],
      cycles: [],
    });

    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");

    await tabs.send();

    expect(httpSend).not.toHaveBeenCalled();
    expect(tabs.unresolvedSendId).toBe("a.req.yaml");
    expect(tabs.unresolvedSendNames).toEqual(["missing"]);

    await tabs.confirmSendUnresolved();
    expect(httpSend).toHaveBeenCalledOnce();
    expect(tabs.unresolvedSendId).toBeNull();
  });

  it("cancelSendUnresolved descarta a pergunta sem enviar", async () => {
    resolveRequest.mockResolvedValueOnce({
      url: "https://example.com/{{missing}}",
      query: [],
      headers: [],
      auth: { type: "none" },
      body: { type: "none" },
      unresolved: ["missing"],
      used: [],
      cycles: [],
    });

    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");
    await tabs.send();

    tabs.cancelSendUnresolved();
    expect(tabs.unresolvedSendId).toBeNull();
    expect(httpSend).not.toHaveBeenCalled();
  });

  it("abrir settings de uma pasta cria uma aba fixa; reabrir só ativa (EP-07.1)", async () => {
    const tabs = useRequestTabsStore();

    await tabs.openFolderTab("Users");
    expect(tabs.tabs).toHaveLength(1);
    expect(tabs.tabs[0].kind).toBe("folder");
    expect(tabs.tabs[0].pinned).toBe(true);
    expect(tabs.activeId).toBe("Users");

    await tabs.openPinned("a.req.yaml");
    expect(tabs.tabs).toHaveLength(2);

    await tabs.openFolderTab("Users");
    expect(tabs.tabs).toHaveLength(2);
    expect(tabs.activeId).toBe("Users");
  });

  it("saveFolderTab grava auth/docs/variables preservando o resto de folder.yaml", async () => {
    const tabs = useRequestTabsStore();
    await tabs.openFolderTab("Users");

    const active = tabs.active;
    if (!isFolderTab(active)) throw new Error("expected a folder tab");
    active.docs = "some docs";
    active.variables = [{ name: "base", value: "https://api.test", enabled: true }];
    tabs.markActiveDirty();
    expect(tabs.active?.dirty).toBe(true);

    await tabs.saveFolderTab(active.id);

    expect(nodeWrite).toHaveBeenCalledOnce();
    const written = nodeWrite.mock.calls[0][0].node as FolderNode;
    expect(written.data?.docs).toBe("some docs");
    expect(written.data?.variables).toEqual([
      { name: "base", value: "https://api.test", enabled: true },
    ]);
    expect(tabs.active?.dirty).toBe(false);
  });

  describe("scripts (EP-09-T03)", () => {
    it("runs preRequest outside-in (folder then request) and tests inside-out (request then folder)", async () => {
      const workspace = useWorkspaceStore();
      workspace.tree = {
        root: ROOT,
        data: { wttp: 1, name: "Test" },
        environments: [],
        children: [
          {
            kind: "folder",
            path: "Users",
            name: "Users",
            seq: 1,
            data: {
              wttp: 1,
              name: "Users",
              seq: 1,
              scripts: { preRequest: "folder-pre", tests: "folder-tests" },
            },
            children: [],
          },
        ],
      };

      nodeRead.mockImplementationOnce(async () => ({
        kind: "request",
        path: "Users/a.req.yaml",
        name: "a",
        seq: 1,
        data: { ...requestFile("a"), scripts: { preRequest: "own-pre", tests: "own-tests" } },
      }));

      const order: string[] = [];
      scriptRun.mockImplementation(async ({ code, phase }: { code: string; phase: string }) => {
        order.push(`${phase}:${code}`);
        return { ok: true, vars: {}, assertions: [], console: [] };
      });

      const tabs = useRequestTabsStore();
      await tabs.openPinned("Users/a.req.yaml");
      await tabs.send();

      expect(order).toEqual([
        "preRequest:folder-pre",
        "preRequest:own-pre",
        "tests:own-tests",
        "tests:folder-tests",
      ]);
      expect(httpSend).toHaveBeenCalledOnce();
    });

    it("aborts the send when a pre-request script fails, with a clear error", async () => {
      nodeRead.mockImplementationOnce(async () => ({
        kind: "request",
        path: "a.req.yaml",
        name: "a",
        seq: 1,
        data: { ...requestFile("a"), scripts: { preRequest: "throw new Error('boom')" } },
      }));
      scriptRun.mockImplementationOnce(async () => ({
        ok: false,
        vars: {},
        assertions: [],
        console: [],
        error: { code: "UNKNOWN" as const, message: "boom" },
      }));

      const tabs = useRequestTabsStore();
      await tabs.openPinned("a.req.yaml");
      await tabs.send();

      expect(httpSend).not.toHaveBeenCalled();
      const active = tabs.active;
      if (!isRequestTab(active)) throw new Error("expected a request tab");
      expect(active.scriptRun?.preRequestError?.error.message).toBe("boom");
      expect(active.scriptRun?.preRequestError?.source).toBe("This request");
    });

    it("does not fail the request when a tests script fails — the response still shows", async () => {
      nodeRead.mockImplementationOnce(async () => ({
        kind: "request",
        path: "a.req.yaml",
        name: "a",
        seq: 1,
        data: { ...requestFile("a"), scripts: { tests: "throw new Error('assert boom')" } },
      }));
      scriptRun.mockImplementationOnce(async () => ({
        ok: false,
        vars: {},
        assertions: [],
        console: [],
        error: { code: "UNKNOWN" as const, message: "assert boom" },
      }));

      const tabs = useRequestTabsStore();
      await tabs.openPinned("a.req.yaml");
      await tabs.send();

      expect(httpSend).toHaveBeenCalledOnce();
      const active = tabs.active;
      if (!isRequestTab(active)) throw new Error("expected a request tab");
      expect(active.lastResult).toEqual({ ok: true });
      expect(active.scriptRun?.assertions).toEqual([
        expect.objectContaining({ passed: false, message: "assert boom" }),
      ]);
    });

    it("carries wttp.setVar across sends via the runtime var store", async () => {
      nodeRead.mockImplementationOnce(async () => ({
        kind: "request",
        path: "login.req.yaml",
        name: "login",
        seq: 1,
        data: { ...requestFile("login"), scripts: { tests: "save-token" } },
      }));
      scriptRun.mockImplementationOnce(async ({ vars }: { vars: Record<string, string> }) => ({
        ok: true,
        vars: { ...vars, access_token: "abc123" },
        assertions: [],
        console: [],
      }));

      const tabs = useRequestTabsStore();
      await tabs.openPinned("login.req.yaml");
      await tabs.send();

      expect(useScriptRuntimeStore().vars).toEqual({ access_token: "abc123" });
    });
  });
});

import type {
  EnvironmentListItem,
  FolderFile,
  FolderNode,
  HttpResponseResult,
  RequestFile,
  RequestNode,
} from "@shared";

import { useEnvironmentStore } from "@renderer/stores/environment";
import { hasRequestContent, useRequestStore } from "@renderer/stores/request";
import { useToastStore } from "@renderer/stores/toast";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import githubCurlFixture from "../../../main/importers/__fixtures__/github-get-repo.curl.txt?raw";
import { curlImporter, parseCurlToRequest } from "../../../main/importers/curl";
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
const setDrafts = vi.fn<
  (payload: { root: string; drafts: Record<string, unknown> }) => Promise<void>
>(async () => {});
const getDrafts = vi.fn(async () => ({}) as Record<string, unknown>);
const httpSend = vi.fn<(spec: unknown) => Promise<HttpResponseResult>>(
  async () => ({ ok: true }) as HttpResponseResult,
);
const historyAppend = vi.fn<
  (payload: {
    root: string;
    path: string;
    request: unknown;
    response: unknown;
    secrets: string[];
  }) => Promise<void>
>(async () => {});
type ResolvedVariableLike = { name: string; value: string; source: string };
const resolveRequest = vi.fn(
  async ({
    request,
  }: {
    request: { url: string; query: unknown; headers: unknown; auth: unknown; body: unknown };
  }) => ({
    ...request,
    unresolved: [] as string[],
    used: [] as ResolvedVariableLike[],
    cycles: [] as string[][],
  }),
);
type AuthLike = { type: string } | undefined;
const resolveAuthChain = vi.fn(async ({ chain }: { chain: AuthLike[] }) => {
  const index = chain.findIndex(auth => auth && auth.type !== "inherit");
  return index === -1
    ? { auth: { type: "none" }, sourceIndex: null }
    : { auth: chain[index], sourceIndex: index };
});
type ScriptRunSpecLike = {
  code: string;
  phase: string;
  envVars: Record<string, string> | null;
  activeEnvironmentName?: string;
  collectionVars: Record<string, string> | null;
  collectionName?: string;
  req?: unknown;
  res?: unknown;
  timeoutMs?: number;
};
type ScriptRunResultLike = {
  ok: boolean;
  envVars: Record<string, string> | null;
  collectionVars: Record<string, string> | null;
  assertions: { name: string; passed: boolean; message?: string; durationMs: number }[];
  console: { level: string; message: string; phase: string }[];
  error?: { code: string; message: string };
};
const scriptRun = vi.fn<(spec: ScriptRunSpecLike) => Promise<ScriptRunResultLike>>(async spec => ({
  ok: true,
  envVars: spec.envVars,
  collectionVars: spec.collectionVars,
  assertions: [],
  console: [],
}));

// `env:save`/`env:list` com estado — permite testar wttp.setVar persistindo de verdade,
// e o próximo `refresh()` (que `environment.save` já chama) enxergar o valor novo.
let environments: EnvironmentListItem[] = [];
const envList = vi.fn(async () => environments);
const envSave = vi.fn(
  async (payload: {
    root: string;
    path?: string;
    name: string;
    variables: {
      name: string;
      value?: string;
      enabled: boolean;
      description?: string;
      secret?: boolean;
    }[];
  }) => {
    const path = payload.path ?? `environments/${payload.name}.yaml`;
    const item: EnvironmentListItem = {
      path,
      data: {
        wttp: 1,
        name: payload.name,
        variables: payload.variables.map(v => ({
          name: v.name,
          value: v.secret ? "" : (v.value ?? ""),
          enabled: v.enabled,
          description: v.description,
          secret: v.secret,
        })),
      },
    };
    environments = [...environments.filter(e => e.path !== path), item];
    return item;
  },
);

beforeEach(() => {
  setActivePinia(createPinia());
  nodeRead.mockClear();
  nodeWrite.mockClear();
  setUiState.mockClear();
  setDrafts.mockClear();
  getDrafts.mockClear();
  getDrafts.mockImplementation(async () => ({}));
  httpSend.mockClear();
  historyAppend.mockClear();
  resolveRequest.mockClear();
  resolveAuthChain.mockClear();
  scriptRun.mockClear();
  scriptRun.mockImplementation(async spec => ({
    ok: true,
    envVars: spec.envVars,
    collectionVars: spec.collectionVars,
    assertions: [],
    console: [],
  }));
  environments = [];
  envList.mockClear();
  envSave.mockClear();

  vi.stubGlobal("window", {
    wttp: {
      node: { read: nodeRead, write: nodeWrite },
      workspace: {
        setUiState,
        getUiState: vi.fn(),
        setDrafts,
        getDrafts,
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
      env: { list: envList, save: envSave, delete: vi.fn(), duplicate: vi.fn() },
      secret: { get: vi.fn(async () => null) },
      variables: { resolveText: vi.fn(), resolveRequest, resolveAuthChain },
      script: { run: scriptRun },
      history: { list: vi.fn(async () => []), append: historyAppend, clear: vi.fn() },
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

  it("pin promove uma aba de preview a fixa sem marcar suja nem editar campo (EP-08.1-T02)", async () => {
    const tabs = useRequestTabsStore();
    await tabs.openPreview("a.req.yaml");
    expect(tabs.active?.pinned).toBe(false);

    tabs.pin("a.req.yaml");

    expect(tabs.active?.pinned).toBe(true);
    expect(tabs.active?.dirty).toBe(false);

    // Uma segunda aba de preview não substitui mais a primeira, que virou fixa.
    await tabs.openPreview("b.req.yaml");
    expect(tabs.tabs.map(t => t.path)).toEqual(["a.req.yaml", "b.req.yaml"]);
  });

  it("pin numa aba já fixa é no-op", async () => {
    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");
    setUiState.mockClear();

    tabs.pin("a.req.yaml");

    expect(setUiState).not.toHaveBeenCalled();
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

  it("send() bem-sucedido grava uma entrada de histórico com as variáveis secret usadas (EP-08.1-T03)", async () => {
    resolveRequest.mockResolvedValueOnce({
      url: "https://example.com/a",
      query: [],
      headers: [],
      auth: { type: "none" },
      body: { type: "none" },
      unresolved: [],
      used: [
        { name: "token", value: "s3cr3t", source: "environment" },
        { name: "base_url", value: "https://example.com", source: "environment" },
      ],
      cycles: [],
    });

    const environment = useEnvironmentStore();
    environment.items = [
      {
        path: "environments/dev.yaml",
        data: {
          wttp: 1,
          name: "dev",
          variables: [
            { name: "token", value: "", enabled: true, secret: true },
            { name: "base_url", value: "https://example.com", enabled: true },
          ],
        },
      },
    ];
    environment.setActive("environments/dev.yaml");

    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");
    await tabs.send();

    expect(historyAppend).toHaveBeenCalledOnce();
    const call = historyAppend.mock.calls[0][0];
    expect(call.root).toBe(ROOT);
    expect(call.path).toBe("a.req.yaml");
    // Só o nome marcado `secret: true` no environment ativo entra na lista — `base_url` não é segredo.
    expect(call.secrets).toEqual(["s3cr3t"]);
  });

  it("um envio cancelado não entra no histórico e a aba volta ao que mostrava antes", async () => {
    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");
    await tabs.send();
    const before = (tabs.active as { lastResult?: unknown } | null)?.lastResult;
    historyAppend.mockClear();

    httpSend.mockImplementationOnce(async () => ({
      ok: false,
      requestId: "x",
      error: { code: "CANCELLED", message: "Request was cancelled" },
    }));
    await tabs.send();

    expect(historyAppend).not.toHaveBeenCalled();
    expect((tabs.active as { lastResult?: unknown } | null)?.lastResult).toEqual(before);
    expect((tabs.active as { sending?: boolean } | null)?.sending).toBe(false);
  });

  it("grava a entrada de histórico antes de marcar a aba como não mais enviando — ResponsePanel recarrega o histórico assim que `sending` vira false", async () => {
    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");

    let sendingWhenAppended: boolean | undefined;
    historyAppend.mockImplementationOnce(async () => {
      sendingWhenAppended = (tabs.active as { sending?: boolean } | null)?.sending;
    });

    await tabs.send();

    expect(historyAppend).toHaveBeenCalledOnce();
    expect(sendingWhenAppended).toBe(true);
    expect((tabs.active as { sending?: boolean } | null)?.sending).toBe(false);
  });

  it("passes structured-clone-safe request/response to history:append — reactive tab state must not leak across the IPC boundary", async () => {
    httpSend.mockResolvedValueOnce({
      ok: true,
      requestId: "r1",
      status: 200,
      statusText: "OK",
      headers: [{ name: "Content-Type", value: "application/json", enabled: true }],
      body: new TextEncoder().encode('{"result":{"access_token":"abc"}}'),
      charset: "utf-8",
      size: { headersSent: 0, bodySent: 0, headersReceived: 0, bodyReceived: 0 },
      timing: { dns: 0, connect: 0, tls: 0, ttfb: 0, download: 0, total: 0 },
    });

    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");
    await tabs.send();

    expect(historyAppend).toHaveBeenCalledOnce();
    const call = historyAppend.mock.calls.at(-1)?.[0];
    if (!call) throw new Error("expected history:append to have been called");
    // `structuredClone` é exatamente o que o IPC do Electron usa — se isto lançar,
    // `window.wttp.history.append` teria rejeitado ("An object could not be cloned")
    // na aplicação real, deixando a request sem entrada de histórico.
    expect(() => structuredClone(call.request)).not.toThrow();
    expect(() => structuredClone(call.response)).not.toThrow();
  });

  it("uma falha em history:append não deixa o spinner de sending preso", async () => {
    historyAppend.mockRejectedValueOnce(new Error("disk full"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");
    await tabs.send();

    expect((tabs.active as { sending?: boolean } | null)?.sending).toBe(false);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
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

  it("saveFolderTab grava scripts de pasta/collection (EP-09.1)", async () => {
    const tabs = useRequestTabsStore();
    await tabs.openFolderTab("Users");

    const active = tabs.active;
    if (!isFolderTab(active)) throw new Error("expected a folder tab");
    active.scripts = { preRequest: 'wttp.setVar("x", 1);', tests: "" };
    tabs.markActiveDirty();

    await tabs.saveFolderTab(active.id);

    const written = nodeWrite.mock.calls[0][0].node as FolderNode;
    expect(written.data?.scripts).toEqual({ preRequest: 'wttp.setVar("x", 1);' });
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
      scriptRun.mockImplementation(async spec => {
        order.push(`${spec.phase}:${spec.code}`);
        return {
          ok: true,
          envVars: spec.envVars,
          collectionVars: spec.collectionVars,
          assertions: [],
          console: [],
        };
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
        envVars: null,
        collectionVars: null,
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
      // Nada foi enviado (EP-08.1-T03) — não há request/response de verdade para o histórico.
      expect(historyAppend).not.toHaveBeenCalled();
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
        envVars: null,
        collectionVars: null,
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

    it("persists wttp.setVar into the active environment's YAML (env:save)", async () => {
      environments = [
        { path: "environments/dev.yaml", data: { wttp: 1, name: "Dev", variables: [] } },
      ];
      const workspace = useWorkspaceStore();
      workspace.uiState = {
        expandedPaths: [],
        openTabs: [],
        activeTabPath: null,
        activeEnvironment: "environments/dev.yaml",
      };
      await useEnvironmentStore().refresh();

      nodeRead.mockImplementationOnce(async () => ({
        kind: "request",
        path: "login.req.yaml",
        name: "login",
        seq: 1,
        data: { ...requestFile("login"), scripts: { tests: "save-token" } },
      }));
      scriptRun.mockImplementationOnce(async spec => ({
        ok: true,
        envVars: { ...spec.envVars, access_token: "abc123" },
        collectionVars: spec.collectionVars,
        assertions: [],
        console: [],
      }));

      const tabs = useRequestTabsStore();
      await tabs.openPinned("login.req.yaml");
      await tabs.send();

      expect(envSave).toHaveBeenCalledOnce();
      const saved = envSave.mock.calls[0][0];
      expect(saved.variables).toEqual([
        {
          name: "access_token",
          value: "abc123",
          enabled: true,
          description: undefined,
          secret: undefined,
        },
      ]);
    });

    it("never overwrites a secret environment variable through wttp.setVar", async () => {
      environments = [
        {
          path: "environments/dev.yaml",
          data: {
            wttp: 1,
            name: "Dev",
            variables: [{ name: "api_key", value: "", enabled: true, secret: true }],
          },
        },
      ];
      const workspace = useWorkspaceStore();
      workspace.uiState = {
        expandedPaths: [],
        openTabs: [],
        activeTabPath: null,
        activeEnvironment: "environments/dev.yaml",
      };
      await useEnvironmentStore().refresh();

      nodeRead.mockImplementationOnce(async () => ({
        kind: "request",
        path: "a.req.yaml",
        name: "a",
        seq: 1,
        data: { ...requestFile("a"), scripts: { tests: "leak" } },
      }));
      scriptRun.mockImplementationOnce(async spec => ({
        ok: true,
        envVars: { ...spec.envVars, api_key: "leaked-plaintext" },
        collectionVars: spec.collectionVars,
        assertions: [],
        console: [],
      }));

      const tabs = useRequestTabsStore();
      await tabs.openPinned("a.req.yaml");
      await tabs.send();

      // O script "vazou" o valor no envVars devolvido, mas a persistência recusa —
      // `api_key` continua secreto, sem o valor em texto puro escrito no YAML.
      expect(envSave).toHaveBeenCalledOnce();
      const saved = envSave.mock.calls[0][0];
      expect(saved.variables).toHaveLength(1);
      expect(saved.variables[0]).toMatchObject({ name: "api_key", secret: true });
      expect(saved.variables[0].value).toBeUndefined();
    });

    it("persists wttp.setCollectionVar into the collection's folder.yaml (node:write)", async () => {
      const workspace = useWorkspaceStore();
      workspace.tree = {
        root: ROOT,
        data: { wttp: 1, name: "Test" },
        environments: [],
        children: [
          {
            kind: "folder",
            path: "SGA",
            name: "SGA",
            seq: 1,
            data: { wttp: 1, name: "SGA", seq: 1, variables: [] },
            children: [],
          },
        ],
      };

      nodeRead.mockImplementationOnce(async () => ({
        kind: "request",
        path: "SGA/a.req.yaml",
        name: "a",
        seq: 1,
        data: { ...requestFile("a"), scripts: { tests: "save-base-url" } },
      }));
      scriptRun.mockImplementationOnce(async spec => ({
        ok: true,
        envVars: spec.envVars,
        collectionVars: { ...spec.collectionVars, base_url: "https://staging.example.com" },
        assertions: [],
        console: [],
      }));

      const tabs = useRequestTabsStore();
      await tabs.openPinned("SGA/a.req.yaml");
      await tabs.send();

      const written = nodeWrite.mock.calls.find(([args]) => args.path === "SGA")?.[0]
        .node as FolderNode;
      expect(written?.data?.variables).toEqual([
        { name: "base_url", value: "https://staging.example.com", enabled: true },
      ]);
    });

    it("passes structured-clone-safe folder data to node:write when the collection has auth/scripts — reactive tree state must not leak across the IPC boundary", async () => {
      const workspace = useWorkspaceStore();
      workspace.tree = {
        root: ROOT,
        data: { wttp: 1, name: "Test" },
        environments: [],
        children: [
          {
            kind: "folder",
            path: "SGA",
            name: "SGA",
            seq: 1,
            data: {
              wttp: 1,
              name: "SGA",
              seq: 1,
              variables: [],
              auth: { type: "bearer", bearer: { token: "{{token}}" } },
              scripts: { preRequest: "noop" },
            },
            children: [],
          },
        ],
      };

      nodeRead.mockImplementationOnce(async () => ({
        kind: "request",
        path: "SGA/a.req.yaml",
        name: "a",
        seq: 1,
        data: { ...requestFile("a"), scripts: { tests: "save-base-url" } },
      }));
      scriptRun.mockImplementationOnce(async spec => ({
        ok: true,
        envVars: spec.envVars,
        collectionVars: { ...spec.collectionVars, base_url: "https://staging.example.com" },
        assertions: [],
        console: [],
      }));

      const tabs = useRequestTabsStore();
      await tabs.openPinned("SGA/a.req.yaml");
      await tabs.send();

      const written = nodeWrite.mock.calls.find(([args]) => args.path === "SGA")?.[0].node;
      if (!written) throw new Error("expected node:write for the collection");
      // `structuredClone` é exatamente o que a ponte do Electron (`contextBridge`) usa —
      // se isto lançar, `window.wttp.node.write` teria rejeitado com "An object could
      // not be cloned" na aplicação real, sincronamente, no ponto de chamada.
      expect(() => structuredClone(written)).not.toThrow();
    });

    it("fails the script clearly when wttp.setVar runs with no active environment", async () => {
      nodeRead.mockImplementationOnce(async () => ({
        kind: "request",
        path: "a.req.yaml",
        name: "a",
        seq: 1,
        data: { ...requestFile("a"), scripts: { tests: "no-env" } },
      }));
      scriptRun.mockImplementationOnce(async () => ({
        ok: false,
        envVars: null,
        collectionVars: null,
        assertions: [],
        console: [],
        error: { code: "UNKNOWN" as const, message: "No active environment — pick one first." },
      }));

      const tabs = useRequestTabsStore();
      await tabs.openPinned("a.req.yaml");
      await tabs.send();

      expect(envSave).not.toHaveBeenCalled();
      const active = tabs.active;
      if (!isRequestTab(active)) throw new Error("expected a request tab");
      expect(active.scriptRun?.assertions[0]).toMatchObject({
        passed: false,
        message: "No active environment — pick one first.",
      });
    });

    it("passes a structured-clone-safe res to script:run — reactive tab state must not leak across the IPC boundary", async () => {
      nodeRead.mockImplementationOnce(async () => ({
        kind: "request",
        path: "a.req.yaml",
        name: "a",
        seq: 1,
        data: { ...requestFile("a"), scripts: { tests: "noop" } },
      }));
      httpSend.mockResolvedValueOnce({
        ok: true,
        requestId: "r1",
        status: 200,
        statusText: "OK",
        headers: [{ name: "Content-Type", value: "application/json", enabled: true }],
        body: new TextEncoder().encode('{"result":{"access_token":"abc"}}'),
        charset: "utf-8",
        size: { headersSent: 0, bodySent: 0, headersReceived: 0, bodyReceived: 0 },
        timing: { dns: 0, connect: 0, tls: 0, ttfb: 0, download: 0, total: 0 },
      });

      const tabs = useRequestTabsStore();
      await tabs.openPinned("a.req.yaml");
      await tabs.send();

      const call = scriptRun.mock.calls.find(([spec]) => spec.phase === "tests");
      expect(call).toBeTruthy();
      const passedRes = call?.[0].res as { body: Uint8Array };
      // `structuredClone` é exatamente o que o IPC do Electron usa — se isto lançar,
      // `window.wttp.script.run` teria rejeitado silenciosamente na aplicação real,
      // deixando `tab.scriptRun` preso em `null` (a aba Tests nunca aparece).
      expect(() => structuredClone(passedRes)).not.toThrow();
      expect(passedRes.body).toBeInstanceOf(Uint8Array);
    });
  });

  describe("rascunhos (EP-08.1-T01)", () => {
    it("salvar uma aba apaga o rascunho correspondente", async () => {
      const tabs = useRequestTabsStore();
      await tabs.openPinned("a.req.yaml");
      const active = tabs.active;
      if (!isRequestTab(active)) throw new Error("expected a request tab");
      active.url = "https://example.com/changed";
      tabs.markActiveDirty();

      await tabs.save("a.req.yaml");

      const lastCall = setDrafts.mock.calls.at(-1)?.[0];
      expect(lastCall?.drafts).toEqual({});
    });

    it("descartar uma aba suja apaga o rascunho correspondente", async () => {
      const tabs = useRequestTabsStore();
      await tabs.openPinned("a.req.yaml");
      tabs.markActiveDirty();

      tabs.forceClose("a.req.yaml");

      const lastCall = setDrafts.mock.calls.at(-1)?.[0];
      expect(lastCall?.drafts).toEqual({});
    });

    it("flushDrafts grava o texto não salvo da aba ativa", async () => {
      const tabs = useRequestTabsStore();
      await tabs.openPinned("a.req.yaml");
      const active = tabs.active;
      if (!isRequestTab(active)) throw new Error("expected a request tab");
      active.url = "https://example.com/changed";
      tabs.markActiveDirty();

      tabs.flushDrafts();

      const lastCall = setDrafts.mock.calls.at(-1)?.[0];
      expect(lastCall?.root).toBe(ROOT);
      expect(lastCall?.drafts["a.req.yaml"]).toEqual({
        kind: "request",
        data: expect.objectContaining({ url: "https://example.com/changed" }),
      });
    });

    it("restoreSession aplica o rascunho por cima do nó lido, já suja", async () => {
      getDrafts.mockImplementationOnce(async () => ({
        "a.req.yaml": {
          kind: "request",
          data: { ...requestFile("a"), url: "https://example.com/draft" },
        },
      }));

      const tabs = useRequestTabsStore();
      const workspace = useWorkspaceStore();
      workspace.uiState = {
        expandedPaths: [],
        openTabs: [{ path: "a.req.yaml", pinned: true, kind: "request" }],
        activeTabPath: "a.req.yaml",
        activeEnvironment: null,
      };

      await tabs.restoreSession();

      expect(getDrafts).toHaveBeenCalledWith({ root: ROOT });
      const restored = tabs.active;
      if (!isRequestTab(restored)) throw new Error("expected a request tab");
      expect(restored.url).toBe("https://example.com/draft");
      expect(restored.dirty).toBe(true);
    });

    it("trocar de workspace grava o rascunho da raiz anterior antes de sair", async () => {
      const tabs = useRequestTabsStore();
      await tabs.openPinned("a.req.yaml");
      const active = tabs.active;
      if (!isRequestTab(active)) throw new Error("expected a request tab");
      active.url = "https://example.com/changed";
      tabs.markActiveDirty();

      const workspace = useWorkspaceStore();
      const OTHER_ROOT = "/other-workspace";
      workspace.tree = {
        root: OTHER_ROOT,
        data: { wttp: 1, name: "Other" },
        environments: [],
        children: [],
      };
      await nextTick();

      const flushCall = setDrafts.mock.calls.find(call => call[0].root === ROOT);
      expect(flushCall?.[0].drafts["a.req.yaml"]).toEqual({
        kind: "request",
        data: expect.objectContaining({ url: "https://example.com/changed" }),
      });
    });

    it("sair de uma pasta que nunca virou workspace (needsInit) não grava .wttp/drafts.json nela", async () => {
      useRequestTabsStore();
      const workspace = useWorkspaceStore();

      // Usuário abriu uma pasta sem `wttp.yaml` (tela "Not a workspace yet") e depois
      // escolheu outra pasta — `root` mudou, mas a anterior nunca foi um workspace de
      // verdade, então nada devia ser gravado nela.
      workspace.tree = { root: "/not-a-workspace", data: null, environments: [], children: [] };
      await nextTick();
      setDrafts.mockClear();

      workspace.tree = {
        root: "/other-workspace",
        data: { wttp: 1, name: "Other" },
        environments: [],
        children: [],
      };
      await nextTick();

      expect(setDrafts).not.toHaveBeenCalledWith(
        expect.objectContaining({ root: "/not-a-workspace" }),
      );
    });
  });

  describe("copyAsCurl (ClickLocal #44)", () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});

    beforeEach(() => {
      writeText.mockClear();
      vi.stubGlobal("navigator", { clipboard: { writeText } });
    });

    function resolvedWith(
      overrides: Record<string, unknown>,
    ): Awaited<ReturnType<typeof resolveRequest>> {
      return {
        url: "https://example.com/a",
        query: [],
        headers: [],
        auth: { type: "bearer", bearer: { token: "s3cr3t" } },
        body: { type: "none" },
        unresolved: [] as string[],
        used: [{ name: "token", value: "s3cr3t", source: "environment" }],
        cycles: [] as string[][],
        ...overrides,
      } as Awaited<ReturnType<typeof resolveRequest>>;
    }

    it("copies the open tab's unsaved state, resolved like send(), with auth masked", async () => {
      const tabs = useRequestTabsStore();
      await tabs.openPinned("a.req.yaml");
      const tab = tabs.active;
      if (!isRequestTab(tab)) throw new Error("expected a request tab");
      tab.url = "https://example.com/edited";
      resolveRequest.mockResolvedValueOnce(resolvedWith({ url: "https://example.com/edited" }));

      await tabs.copyAsCurl("a.req.yaml");

      expect(resolveRequest.mock.calls[0][0].request.url).toBe("https://example.com/edited");
      expect(httpSend).not.toHaveBeenCalled();
      const command = writeText.mock.calls[0][0];
      expect(command).toContain("'https://example.com/edited'");
      expect(command).toContain("Authorization: Bearer ****");
      expect(command).not.toContain("s3cr3t");
      expect(useToastStore().items.at(-1)).toMatchObject({
        message: "Copied as cURL",
        variant: "success",
      });
    });

    it("copies the real values only with the explicit with-secrets action", async () => {
      resolveRequest.mockResolvedValueOnce(resolvedWith({}));
      const tabs = useRequestTabsStore();

      // Não aberta em aba: lê do disco (menu de contexto da árvore).
      await tabs.copyAsCurl("a.req.yaml", true);

      expect(nodeRead).toHaveBeenCalledWith({ root: ROOT, path: "a.req.yaml" });
      expect(tabs.tabs).toHaveLength(0);
      expect(writeText.mock.calls[0][0]).toContain("Authorization: Bearer s3cr3t");
    });

    it("masks secret environment variables wherever they appear", async () => {
      const environment = useEnvironmentStore();
      environment.items = [
        {
          path: "environments/dev.yaml",
          data: {
            wttp: 1,
            name: "dev",
            variables: [{ name: "token", value: "", enabled: true, secret: true }],
          },
        },
      ];
      environment.setActive("environments/dev.yaml");
      resolveRequest.mockResolvedValueOnce(
        resolvedWith({
          auth: { type: "none" },
          headers: [{ name: "X-Token", value: "s3cr3t", enabled: true }],
        }),
      );
      const tabs = useRequestTabsStore();

      await tabs.copyAsCurl("a.req.yaml");

      expect(writeText.mock.calls[0][0]).toContain("--header 'X-Token: ****'");
    });

    it("keeps unresolved {{var}} literal and warns in the toast", async () => {
      resolveRequest.mockResolvedValueOnce(
        resolvedWith({
          url: "https://example.com/users/{{userId}}",
          auth: { type: "none" },
          unresolved: ["userId"],
        }),
      );
      const tabs = useRequestTabsStore();

      await tabs.copyAsCurl("a.req.yaml");

      expect(writeText.mock.calls[0][0]).toContain("/users/{{userId}}");
      expect(useToastStore().items.at(-1)).toMatchObject({
        message: "Copied as cURL — unresolved variables left as-is: userId",
        variant: "warning",
      });
    });
  });

  describe("paste cURL into the URL bar (ClickLocal #45)", () => {
    const nodeCreate = vi.fn(
      async ({ parentPath }: { root: string; parentPath: string; kind: string; name: string }) => ({
        path: parentPath ? `${parentPath}/new-request.req.yaml` : "new-request.req.yaml",
      }),
    );
    // O parser de verdade (o mesmo que `import:parseCurl` chama no main) — puro, sem `node:*`.
    const parseCurl = vi.fn(async ({ content }: { content: string }) =>
      parseCurlToRequest(content),
    );

    function blankNode(path: string): RequestNode {
      return {
        kind: "request",
        path,
        name: "New request",
        seq: 2,
        data: { wttp: 1, name: "New request", seq: 2, method: "GET", url: "" },
      };
    }

    beforeEach(() => {
      nodeCreate.mockClear();
      parseCurl.mockClear();
      const wttp = (window as unknown as { wttp: Record<string, Record<string, unknown>> }).wttp;
      wttp.node.create = nodeCreate;
      wttp.import = { parseCurl };
      nodeRead.mockImplementation(async ({ path }: { path: string }) => {
        if (path.endsWith("new-request.req.yaml")) return blankNode(path);
        if (!path.endsWith(".req.yaml")) return folderNode(path, path);
        return requestNode(path, path.replace(".req.yaml", ""));
      });
    });

    it("fills an empty tab in place, with the same request the import modal would create", async () => {
      const tabs = useRequestTabsStore();
      await tabs.openPinned("api/new-request.req.yaml");

      const outcome = await useRequestStore().applyPastedCurl(githubCurlFixture);

      expect(outcome).toBe("filled");
      expect(nodeCreate).not.toHaveBeenCalled();
      expect(tabs.tabs).toHaveLength(1);
      const tab = tabs.active;
      if (!isRequestTab(tab)) throw new Error("expected a request tab");
      expect(tab.dirty).toBe(true);

      // O que o import via modal grava (`emit` escreve os campos do filho normalizado).
      const imported = curlImporter.normalize(curlImporter.parse(githubCurlFixture)).children[0];
      if (imported.kind !== "request") throw new Error("expected a request");
      expect(tab.method).toBe(imported.method);
      expect(tab.url).toBe(imported.url);
      expect(tab.query).toEqual(imported.query);
      expect(tab.headers).toEqual(imported.headers);
      expect(tab.body).toEqual(imported.body ?? { type: "none" });
      expect(tab.auth).toEqual(imported.auth ?? { type: "none" });
    });

    it("never overwrites a tab with content: the cURL goes to a new request next to it", async () => {
      const tabs = useRequestTabsStore();
      await tabs.openPinned("api/users.req.yaml");
      const original = tabs.active;
      if (!isRequestTab(original)) throw new Error("expected a request tab");
      const before = JSON.stringify({ ...original, lastResult: null });

      const outcome = await useRequestStore().applyPastedCurl(
        "curl -X POST 'https://api.example.com/items?page=2' -H 'X-A: 1' --data-raw '{\"a\":1}'",
      );

      expect(outcome).toBe("newTab");
      expect(nodeCreate).toHaveBeenCalledWith(
        expect.objectContaining({ root: ROOT, parentPath: "api", kind: "request" }),
      );
      expect(JSON.stringify({ ...original, lastResult: null })).toBe(before);
      expect(original.dirty).toBe(false);

      const created = tabs.active;
      if (!isRequestTab(created)) throw new Error("expected a request tab");
      expect(created.path).toBe("api/new-request.req.yaml");
      expect(created.pinned).toBe(true);
      expect(created.dirty).toBe(true);
      expect(created.method).toBe("POST");
      // URL já com a query, consistente com a tabela de params.
      expect(created.url).toBe("https://api.example.com/items?page=2");
      expect(created.query).toEqual([{ name: "page", value: "2", enabled: true }]);
      expect(created.headers).toEqual([{ name: "X-A", value: "1", enabled: true }]);
      expect(created.body).toEqual({ type: "json", json: '{"a":1}' });
      expect(useToastStore().items.at(-1)?.message).toBe(
        "Imported from cURL into a new request — the current one was kept",
      );
    });

    it("pastes nothing for an invalid cURL, only warns", async () => {
      const tabs = useRequestTabsStore();
      await tabs.openPinned("api/new-request.req.yaml");
      const tab = tabs.active;
      if (!isRequestTab(tab)) throw new Error("expected a request tab");

      const outcome = await useRequestStore().applyPastedCurl("curl -X POST -H 'X-A: 1'");

      expect(outcome).toBe("invalid");
      expect(nodeCreate).not.toHaveBeenCalled();
      expect(tab.url).toBe("");
      expect(tab.headers).toEqual([]);
      expect(tab.dirty).toBe(false);
      expect(useToastStore().items.at(-1)).toMatchObject({
        message: "That doesn't look like a valid cURL command — nothing was pasted",
        variant: "warning",
      });
    });

    it("hasRequestContent looks only at the fields a cURL would replace", () => {
      const blank = {
        url: "",
        pathParams: [],
        query: [],
        headers: [],
        body: { type: "none" } as const,
        auth: { type: "none" } as const,
      };
      expect(hasRequestContent(blank)).toBe(false);
      expect(hasRequestContent({ ...blank, auth: { type: "inherit" } })).toBe(false);
      expect(
        hasRequestContent({ ...blank, headers: [{ name: "", value: "", enabled: true }] }),
      ).toBe(false);
      expect(hasRequestContent({ ...blank, url: "https://x" })).toBe(true);
      expect(
        hasRequestContent({ ...blank, headers: [{ name: "X", value: "", enabled: false }] }),
      ).toBe(true);
      expect(hasRequestContent({ ...blank, body: { type: "json", json: "" } })).toBe(true);
      expect(hasRequestContent({ ...blank, auth: { type: "bearer", bearer: { token: "" } } })).toBe(
        true,
      );
    });
  });
});

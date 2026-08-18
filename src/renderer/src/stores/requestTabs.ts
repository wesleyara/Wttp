import type {
  AuthConfig,
  FolderFile,
  FolderNode,
  HttpMethod,
  HttpRequestSpec,
  HttpResponseResult,
  KeyValueEntry,
  RequestBody,
  RequestFile,
  RequestNode,
  RequestScripts,
  ResolveRequestResultPayload,
  SaveFileResult,
  ScriptAssertion,
  ScriptConsoleEntry,
  WttpError,
} from "@shared";

import { suggestedFileName } from "@renderer/lib/content-type";
import { buildScriptChain, linksWithCode, orderForPhase } from "@renderer/lib/scriptChain";
import { useScriptRuntimeStore } from "@renderer/stores/scriptRuntime";
import { useToastStore } from "@renderer/stores/toast";
import { useVariablesStore } from "@renderer/stores/variables";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref, toRaw, watch } from "vue";

/** Tira a reatividade do Pinia antes de cruzar a ponte de IPC — Proxy reativo não é clonável pelo Electron. */
function unwrap<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T;
}

/** `{}`/campos vazios não vão para o YAML — mesmo cuidado que `docs: tab.docs || undefined` já toma. */
function cleanScripts(scripts: RequestScripts): RequestScripts | undefined {
  const preRequest = scripts.preRequest?.trim() ? scripts.preRequest : undefined;
  const tests = scripts.tests?.trim() ? scripts.tests : undefined;
  if (!preRequest && !tests) return undefined;
  return { preRequest, tests };
}

/** Uma asserção ou linha de console já com de qual elo da cadeia (request/pasta/collection) ela veio (EP-09-T05). */
export type ScriptAssertionWithSource = ScriptAssertion & { source: string };
export type ScriptConsoleEntryWithSource = ScriptConsoleEntry & { source: string };

/** Resultado dos scripts do último envio (EP-09-T05) — `null` até a primeira vez que a aba envia. */
export interface ScriptRunSummary {
  assertions: ScriptAssertionWithSource[];
  console: ScriptConsoleEntryWithSource[];
  /** Exceção não tratada no pre-request de algum elo da cadeia — abortou o envio. */
  preRequestError?: { source: string; error: WttpError };
}

export interface RequestTabState {
  kind: "request";
  /** Igual a `path` — muda junto quando a request é renomeada (`renamePath`). */
  id: string;
  path: string;
  /** Nome do nó (`WorkspaceNode.name`) — só muda por rename na árvore, nunca editado aqui. */
  title: string;
  /** `false` = aba de preview (itálico), substituída pela próxima aberta em preview. */
  pinned: boolean;
  dirty: boolean;
  method: HttpMethod;
  url: string;
  pathParams: KeyValueEntry[];
  query: KeyValueEntry[];
  headers: KeyValueEntry[];
  body: RequestBody;
  auth: AuthConfig;
  docs: string;
  scripts: RequestScripts;
  sending: boolean;
  requestId: string | null;
  lastResult: HttpResponseResult | null;
  scriptRun: ScriptRunSummary | null;
  /** Último `RequestFile` salvo — base do próximo `save`, preserva `settings`/`scripts`/`unknown`. */
  originalData: RequestFile;
}

/**
 * Aba de settings de pasta/collection (EP-07.1) — mesmo `folder.yaml` que
 * `useTreeStore` editava por modal antes, agora vivendo no mesmo strip das abas de
 * request. Sempre `pinned: true`: não existe conceito de preview para uma pasta, um
 * clique simples já abre/ativa a aba definitiva, como uma request fixada.
 */
export interface FolderTabState {
  kind: "folder";
  id: string;
  path: string;
  /** Nome do nó — só muda por rename na árvore. */
  title: string;
  /** `true` quando a pasta está na raiz do workspace — rótulo "Collection" vs "Folder" na UI, sem campo novo no formato de arquivo. */
  isCollection: boolean;
  pinned: true;
  dirty: boolean;
  auth: AuthConfig;
  docs: string;
  variables: KeyValueEntry[];
  /** Último `FolderFile` salvo — base do próximo save, preserva campos desconhecidos e os que esta UI não edita. */
  originalData: FolderFile;
}

export type OpenTab = RequestTabState | FolderTabState;

export function isRequestTab(tab: OpenTab | null | undefined): tab is RequestTabState {
  return tab?.kind === "request";
}

export function isFolderTab(tab: OpenTab | null | undefined): tab is FolderTabState {
  return tab?.kind === "folder";
}

function buildTab(node: RequestNode, pinned: boolean): RequestTabState {
  const data = node.data as RequestFile;
  return {
    kind: "request",
    id: node.path,
    path: node.path,
    title: node.name,
    pinned,
    dirty: false,
    method: data.method,
    url: data.url,
    pathParams: data.pathParams ?? [],
    query: data.query ?? [],
    headers: data.headers ?? [],
    body: data.body ?? { type: "none" },
    auth: data.auth ?? { type: "none" },
    docs: data.docs ?? "",
    scripts: { ...data.scripts },
    sending: false,
    requestId: null,
    lastResult: null,
    scriptRun: null,
    originalData: data,
  };
}

/** Sem `folder.yaml` em disco ainda (pasta "nua", válida) — mesmo mínimo que o antigo `useTreeStore.openAuthEditor` usava, antes de virar aba. */
function emptyFolderFile(node: FolderNode): FolderFile {
  return { wttp: 1, name: node.name, seq: node.seq };
}

function buildFolderTab(node: FolderNode, isCollection: boolean): FolderTabState {
  const data = node.data ?? emptyFolderFile(node);
  return {
    kind: "folder",
    id: node.path,
    path: node.path,
    title: node.name,
    isCollection,
    pinned: true,
    dirty: false,
    auth: data.auth ?? { type: "inherit" },
    docs: data.docs ?? "",
    variables: (data.variables ?? []).map(v => ({ ...v })),
    originalData: data,
  };
}

/** Uma pasta na raiz do workspace é uma "Collection" na UI — path relativo sem `/` (docs/file-format.md não distingue os dois, é só rótulo). */
function isCollectionPath(path: string): boolean {
  return !path.includes("/");
}

/**
 * Abas abertas no strip central (EP-05-T05, generalizado em EP-07.1 para também
 * cobrir settings de pasta/collection) — cada uma com seu próprio estado,
 * independente das outras. `useRequestStore` continua uma fachada sobre a aba ativa
 * *de request*; `FolderConfigTabs` lê a aba ativa *de pasta* direto daqui, já que só
 * um componente consome esse formato.
 */
export const useRequestTabsStore = defineStore("requestTabs", () => {
  const workspace = useWorkspaceStore();
  const variables = useVariablesStore();
  const toast = useToastStore();

  const tabs = ref<OpenTab[]>([]);
  const activeId = ref<string | null>(null);
  /** Aba com confirmação de fechar pendente (suja) — `null` quando nenhuma pergunta está aberta. */
  const closeConfirmId = ref<string | null>(null);
  /** Aba com variável não resolvida a confirmar antes de enviar (EP-06-T05) — `null` = nenhuma pergunta pendente. */
  const unresolvedSendId = ref<string | null>(null);
  const unresolvedSendNames = ref<string[]>([]);

  const active = computed(() => tabs.value.find(tab => tab.id === activeId.value) ?? null);
  const closeConfirmTab = computed(
    () => tabs.value.find(tab => tab.id === closeConfirmId.value) ?? null,
  );
  const unresolvedSendTab = computed(() => {
    const tab = tabs.value.find(t => t.id === unresolvedSendId.value) ?? null;
    return isRequestTab(tab) ? tab : null;
  });

  function persistSession(): void {
    workspace.patchUiState({
      openTabs: tabs.value.map(tab => ({
        path: tab.path,
        pinned: tab.pinned,
        kind: tab.kind,
      })),
      activeTabPath: activeId.value,
    });
  }

  function activate(id: string): void {
    activeId.value = id;
    persistSession();
  }

  /** Edição em qualquer campo marca suja e promove uma aba de preview a fixa (não-op para pasta, sempre fixa). */
  function markActiveDirty(): void {
    const tab = active.value;
    if (!tab) return;
    tab.dirty = true;
    if (!tab.pinned) {
      tab.pinned = true;
      persistSession();
    }
  }

  async function openTab(path: string, pinned: boolean): Promise<void> {
    if (!workspace.root) return;

    const existing = tabs.value.find(tab => tab.path === path && tab.kind === "request");
    if (existing) {
      if (pinned && !existing.pinned) existing.pinned = true;
      activate(existing.id);
      return;
    }

    const node = (await window.wttp.node.read({ root: workspace.root, path })) as RequestNode;
    if (!node.data) return;

    const newTab = buildTab(node, pinned);
    if (!pinned) {
      const previewIndex = tabs.value.findIndex(tab => tab.kind === "request" && !tab.pinned);
      if (previewIndex !== -1) {
        if (tabs.value[previewIndex].dirty) tabs.value[previewIndex].pinned = true;
        else tabs.value.splice(previewIndex, 1);
      }
    }

    tabs.value.push(newTab);
    activate(newTab.id);
  }

  const openPreview = (path: string): Promise<void> => openTab(path, false);
  const openPinned = (path: string): Promise<void> => openTab(path, true);

  /** Abre (ou ativa, se já aberta) a aba de settings de uma pasta/collection (EP-07.1) — relê `folder.yaml` fresco, mesmo cuidado que `save()` já toma para request. */
  async function openFolderTab(path: string): Promise<void> {
    if (!workspace.root) return;

    const existing = tabs.value.find(tab => tab.path === path && tab.kind === "folder");
    if (existing) {
      activate(existing.id);
      return;
    }

    const node = (await window.wttp.node.read({ root: workspace.root, path })) as FolderNode;
    const newTab = buildFolderTab(node, isCollectionPath(path));
    tabs.value.push(newTab);
    activate(newTab.id);
  }

  function forceClose(id: string): void {
    const index = tabs.value.findIndex(tab => tab.id === id);
    if (index === -1) return;

    tabs.value.splice(index, 1);
    if (activeId.value === id) {
      activeId.value = tabs.value[Math.min(index, tabs.value.length - 1)]?.id ?? null;
    }
    if (closeConfirmId.value === id) closeConfirmId.value = null;
    persistSession();
  }

  function requestClose(id: string): void {
    const tab = tabs.value.find(t => t.id === id);
    if (!tab) return;
    if (tab.dirty) closeConfirmId.value = id;
    else forceClose(id);
  }

  /** Usado quando o nó já foi excluído pela árvore (EP-05-T03) — a confirmação já aconteceu lá. */
  function closeByPath(path: string): void {
    const tab = tabs.value.find(t => t.path === path);
    if (tab) forceClose(tab.id);
  }

  /** Como `closeByPath`, mas também fecha abas (de request ou de pasta) dentro de uma pasta excluída. */
  function closeUnderPath(path: string): void {
    const affected = tabs.value.filter(t => t.path === path || t.path.startsWith(`${path}/`));
    affected.forEach(t => forceClose(t.id));
  }

  /** A árvore renomeou o nó (EP-05-T03) — mantém a aba aberta apontando pro novo path, request ou pasta. */
  function renamePath(oldPath: string, newPath: string, newName: string): void {
    const tab = tabs.value.find(t => t.path === oldPath);
    if (!tab) return;
    tab.path = newPath;
    tab.id = newPath;
    tab.title = newName;
    if (tab.kind === "request") tab.originalData = { ...tab.originalData, name: newName };
    else tab.originalData = { ...tab.originalData, name: newName };
    if (activeId.value === oldPath) activeId.value = newPath;
    persistSession();
  }

  async function save(id: string): Promise<void> {
    const tab = tabs.value.find(t => t.id === id);
    if (!tab || !isRequestTab(tab) || !workspace.root) return;

    const data: RequestFile = {
      ...unwrap(tab.originalData),
      method: tab.method,
      url: tab.url,
      pathParams: unwrap(tab.pathParams),
      query: unwrap(tab.query),
      headers: unwrap(tab.headers),
      auth: unwrap(tab.auth),
      body: unwrap(tab.body),
      scripts: cleanScripts(tab.scripts),
      docs: tab.docs || undefined,
    };
    const node: RequestNode = {
      kind: "request",
      path: tab.path,
      name: tab.originalData.name,
      seq: tab.originalData.seq,
      data,
    };
    await window.wttp.node.write({ root: workspace.root, path: tab.path, node });
    tab.originalData = data;
    tab.dirty = false;
    // O watcher de filesystem ignora a própria escrita (evita loop com o save),
    // então a árvore só reflete campos como `method` se pedirmos o refresh aqui.
    await workspace.refreshTree();
    toast.push(`"${tab.title}" saved`, "success");
  }

  /** Grava `folder.yaml` com auth/docs/variables da aba, preservando campos desconhecidos já presentes — mesmo cuidado que `useTreeStore.saveFolderAuth` tomava antes de virar aba. */
  async function saveFolderTab(id: string): Promise<void> {
    const tab = tabs.value.find(t => t.id === id);
    if (!tab || !isFolderTab(tab) || !workspace.root) return;

    const data: FolderFile = {
      ...unwrap(tab.originalData),
      auth: unwrap(tab.auth),
      docs: tab.docs || undefined,
      variables: unwrap(tab.variables).filter(v => v.name.trim() !== ""),
    };
    const node: FolderNode = {
      kind: "folder",
      path: tab.path,
      name: tab.originalData.name,
      seq: tab.originalData.seq,
      data,
      // `writeNode` no main só olha `kind`/`data` (src/main/storage/tree.ts) — `children`
      // é só para satisfazer o tipo `FolderNode`, nunca é lido pela escrita.
      children: [],
    };
    await window.wttp.node.write({ root: workspace.root, path: tab.path, node });
    tab.originalData = data;
    tab.dirty = false;
    await workspace.refreshTree();
    toast.push(`"${tab.title}" saved`, "success");
  }

  function saveActive(): Promise<void> {
    const tab = active.value;
    if (!tab) return Promise.resolve();
    return tab.kind === "folder" ? saveFolderTab(tab.id) : save(tab.id);
  }

  async function confirmCloseSave(): Promise<void> {
    if (!closeConfirmId.value) return;
    const id = closeConfirmId.value;
    const tab = tabs.value.find(t => t.id === id);
    if (tab?.kind === "folder") await saveFolderTab(id);
    else await save(id);
    forceClose(id);
  }

  function confirmCloseDiscard(): void {
    if (!closeConfirmId.value) return;
    const tab = tabs.value.find(t => t.id === closeConfirmId.value);
    forceClose(closeConfirmId.value);
    if (tab) toast.push(`Changes to "${tab.title}" discarded`, "warning");
  }

  function cancelClose(): void {
    closeConfirmId.value = null;
  }

  function reorder(id: string, targetIndex: number): void {
    const fromIndex = tabs.value.findIndex(tab => tab.id === id);
    if (fromIndex === -1) return;
    const [moved] = tabs.value.splice(fromIndex, 1);
    tabs.value.splice(Math.max(0, Math.min(targetIndex, tabs.value.length)), 0, moved);
    persistSession();
  }

  function scriptTimeoutFor(): number | undefined {
    return workspace.tree?.data?.settings?.scriptTimeout;
  }

  /**
   * Roda a cadeia de pre-request (EP-09-T03) — collection mais distante primeiro,
   * request por último, logo antes do envio — mutando `spec` a cada elo. Aborta no
   * primeiro elo que falhar: um pre-request quebrado nunca deixa a request sair.
   */
  async function runPreRequestChain(
    tab: RequestTabState,
    initialSpec: HttpRequestSpec,
  ): Promise<
    | { ok: true; spec: HttpRequestSpec; console: ScriptConsoleEntryWithSource[] }
    | {
        ok: false;
        console: ScriptConsoleEntryWithSource[];
        error: { source: string; error: WttpError };
      }
  > {
    const scriptRuntime = useScriptRuntimeStore();
    const chain = orderForPhase(
      buildScriptChain(tab.scripts, variables.folderChain(tab.path)),
      "preRequest",
    );
    const links = linksWithCode(chain, "preRequest");
    const timeoutMs = scriptTimeoutFor();
    const consoleEntries: ScriptConsoleEntryWithSource[] = [];
    let spec = initialSpec;

    for (const link of links) {
      const result = await window.wttp.script.run({
        code: link.code,
        phase: "preRequest",
        vars: unwrap(scriptRuntime.vars),
        req: spec,
        timeoutMs,
      });
      consoleEntries.push(...result.console.map(entry => ({ ...entry, source: link.source })));
      scriptRuntime.setAll(result.vars);
      if (!result.ok) {
        return {
          ok: false,
          console: consoleEntries,
          error: {
            source: link.source,
            error: result.error ?? { code: "UNKNOWN", message: "Pre-request script failed" },
          },
        };
      }
      if (result.req) spec = result.req;
    }

    return { ok: true, spec, console: consoleEntries };
  }

  /** Roda a cadeia de tests (EP-09-T03) — request primeiro, subindo até a collection. Nunca aborta: falha de um script não invalida a resposta já recebida. */
  async function runTestsChain(
    tab: RequestTabState,
    res: HttpResponseResult,
  ): Promise<{ assertions: ScriptAssertionWithSource[]; console: ScriptConsoleEntryWithSource[] }> {
    const scriptRuntime = useScriptRuntimeStore();
    const chain = orderForPhase(
      buildScriptChain(tab.scripts, variables.folderChain(tab.path)),
      "tests",
    );
    const links = linksWithCode(chain, "tests");
    const timeoutMs = scriptTimeoutFor();
    const assertions: ScriptAssertionWithSource[] = [];
    const consoleEntries: ScriptConsoleEntryWithSource[] = [];

    for (const link of links) {
      const result = await window.wttp.script.run({
        code: link.code,
        phase: "tests",
        vars: unwrap(scriptRuntime.vars),
        res,
        timeoutMs,
      });
      assertions.push(...result.assertions.map(a => ({ ...a, source: link.source })));
      consoleEntries.push(...result.console.map(entry => ({ ...entry, source: link.source })));
      scriptRuntime.setAll(result.vars);
      if (!result.ok && result.error) {
        assertions.push({
          name: `${link.source} script`,
          passed: false,
          message: result.error.message,
          durationMs: 0,
          source: link.source,
        });
      }
    }

    return { assertions, console: consoleEntries };
  }

  async function dispatch(
    tab: RequestTabState,
    resolved: ResolveRequestResultPayload,
  ): Promise<void> {
    const id = crypto.randomUUID();
    tab.requestId = id;
    tab.sending = true;
    tab.scriptRun = null;

    try {
      const initialSpec: HttpRequestSpec = {
        requestId: id,
        method: tab.method,
        url: resolved.url,
        query: resolved.query,
        headers: resolved.headers,
        auth: resolved.auth,
        body: resolved.body,
      };

      const preRequest = await runPreRequestChain(tab, initialSpec);
      if (!preRequest.ok) {
        tab.scriptRun = {
          assertions: [],
          console: preRequest.console,
          preRequestError: preRequest.error,
        };
        toast.push(
          `Pre-request script failed (${preRequest.error.source}): ${preRequest.error.error.message}`,
          "error",
        );
        return;
      }

      tab.lastResult = await window.wttp.http.send(preRequest.spec);

      const tests = await runTestsChain(tab, tab.lastResult);
      tab.scriptRun = {
        assertions: tests.assertions,
        console: [...preRequest.console, ...tests.console],
      };
    } finally {
      tab.sending = false;
      tab.requestId = null;
    }
  }

  /**
   * Resolve a herança de auth (EP-07-T01) antes de tudo: `tab.auth` normalmente é
   * `{ type: "inherit" }`, e é a auth efetiva (de uma pasta ou da collection) que
   * precisa passar pelo resolvedor de variáveis a seguir — senão um `{{token}}` numa
   * pasta nunca seria substituído nem sinalizado como não resolvido.
   */
  async function effectiveAuthFor(tab: RequestTabState): Promise<AuthConfig> {
    const { resolution } = await variables.resolveEffectiveAuth(tab.path, tab.auth);
    return resolution.auth;
  }

  /** Resolve `{{var}}` (EP-06-T01) antes de enviar; variável não resolvida pausa e pede confirmação em vez de mandar a request quebrada. */
  async function send(): Promise<void> {
    const tab = active.value;
    if (!isRequestTab(tab) || tab.sending) return;

    const auth = await effectiveAuthFor(tab);
    const resolved = await variables.resolveRequestSpec(
      {
        url: tab.url,
        pathParams: tab.pathParams,
        query: tab.query,
        headers: tab.headers,
        auth,
        body: tab.body,
      },
      tab.path,
    );

    if (resolved.unresolved.length > 0) {
      unresolvedSendId.value = tab.id;
      unresolvedSendNames.value = resolved.unresolved;
      return;
    }

    await dispatch(tab, resolved);
  }

  /** Usuário confirmou enviar mesmo com variável não resolvida — o placeholder original (`{{nome}}`) vai literal na request. */
  async function confirmSendUnresolved(): Promise<void> {
    const tab = unresolvedSendTab.value;
    unresolvedSendId.value = null;
    unresolvedSendNames.value = [];
    if (!tab) return;

    const auth = await effectiveAuthFor(tab);
    const resolved = await variables.resolveRequestSpec(
      {
        url: tab.url,
        pathParams: tab.pathParams,
        query: tab.query,
        headers: tab.headers,
        auth,
        body: tab.body,
      },
      tab.path,
    );
    await dispatch(tab, resolved);
  }

  function cancelSendUnresolved(): void {
    unresolvedSendId.value = null;
    unresolvedSendNames.value = [];
  }

  function cancel(): void {
    const tab = active.value;
    if (!isRequestTab(tab) || !tab.sending || !tab.requestId) return;
    void window.wttp.http.cancel(tab.requestId);
  }

  async function saveResponseToFile(): Promise<SaveFileResult | null> {
    const tab = active.value;
    const result = isRequestTab(tab) ? tab.lastResult : null;
    if (!result?.ok) return null;
    const contentType =
      result.headers.find(h => h.name.toLowerCase() === "content-type")?.value ?? "";
    return window.wttp.dialog.saveFile({
      data: result.body,
      suggestedName: suggestedFileName(contentType),
    });
  }

  async function restoreSession(): Promise<void> {
    if (!workspace.root) return;
    const root = workspace.root;
    const state = workspace.uiState;

    const loaded: OpenTab[] = [];
    for (const entry of state.openTabs) {
      try {
        if (entry.kind === "folder") {
          const node = (await window.wttp.node.read({ root, path: entry.path })) as FolderNode;
          loaded.push(buildFolderTab(node, isCollectionPath(entry.path)));
        } else {
          const node = (await window.wttp.node.read({ root, path: entry.path })) as RequestNode;
          if (node.data) loaded.push(buildTab(node, entry.pinned));
        }
      } catch {
        // Arquivo sumiu ou foi renomeado por fora enquanto o app estava fechado —
        // só não restaura essa aba, o resto da sessão continua.
      }
    }

    tabs.value = loaded;
    activeId.value = loaded.some(tab => tab.path === state.activeTabPath)
      ? state.activeTabPath
      : (loaded[0]?.path ?? null);
  }

  // Workspace fechado: nenhuma aba faz sentido mais. Workspace trocado (`uiStateVersion`
  // avança só quando `loadUiState` lê um `.wttp/ui-state.json` de verdade, nunca no
  // merge de `patchUiState`): reidrata a sessão salva daquele workspace.
  watch(
    () => workspace.root,
    root => {
      if (root) return;
      tabs.value = [];
      activeId.value = null;
      closeConfirmId.value = null;
    },
  );

  watch(
    () => workspace.uiStateVersion,
    version => {
      if (version > 0) void restoreSession();
    },
  );

  return {
    tabs,
    activeId,
    active,
    closeConfirmId,
    closeConfirmTab,
    activate,
    markActiveDirty,
    openPreview,
    openPinned,
    openFolderTab,
    requestClose,
    forceClose,
    closeByPath,
    closeUnderPath,
    renamePath,
    save,
    saveFolderTab,
    saveActive,
    confirmCloseSave,
    confirmCloseDiscard,
    cancelClose,
    reorder,
    send,
    unresolvedSendId,
    unresolvedSendTab,
    unresolvedSendNames,
    confirmSendUnresolved,
    cancelSendUnresolved,
    cancel,
    saveResponseToFile,
    restoreSession,
  };
});

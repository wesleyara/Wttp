import type {
  AuthConfig,
  HttpMethod,
  HttpRequestSpec,
  HttpResponseResult,
  KeyValueEntry,
  RequestBody,
  RequestFile,
  RequestNode,
  ResolveRequestResultPayload,
  SaveFileResult,
} from "@shared";

import { suggestedFileName } from "@renderer/lib/content-type";
import { useVariablesStore } from "@renderer/stores/variables";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref, toRaw, watch } from "vue";

/** Tira a reatividade do Pinia antes de cruzar a ponte de IPC — Proxy reativo não é clonável pelo Electron. */
function unwrap<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T;
}

export interface RequestTabState {
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
  query: KeyValueEntry[];
  headers: KeyValueEntry[];
  body: RequestBody;
  auth: AuthConfig;
  docs: string;
  sending: boolean;
  requestId: string | null;
  lastResult: HttpResponseResult | null;
  /** Último `RequestFile` salvo — base do próximo `save`, preserva `settings`/`scripts`/`unknown`. */
  originalData: RequestFile;
}

function buildTab(node: RequestNode, pinned: boolean): RequestTabState {
  const data = node.data as RequestFile;
  return {
    id: node.path,
    path: node.path,
    title: node.name,
    pinned,
    dirty: false,
    method: data.method,
    url: data.url,
    query: data.query ?? [],
    headers: data.headers ?? [],
    body: data.body ?? { type: "none" },
    auth: data.auth ?? { type: "none" },
    docs: data.docs ?? "",
    sending: false,
    requestId: null,
    lastResult: null,
    originalData: data,
  };
}

/**
 * Abas de request abertas (EP-05-T05) — cada uma com seu próprio método/URL/body/
 * resposta, independente das outras. `useRequestStore` vira uma fachada sobre
 * `active` (computeds com setter), então `RequestConfigTabs`/`RequestUrlBar`/
 * `ResponsePanel` continuam chamando `useRequestStore()` sem saber que existem abas.
 */
export const useRequestTabsStore = defineStore("requestTabs", () => {
  const workspace = useWorkspaceStore();
  const variables = useVariablesStore();

  const tabs = ref<RequestTabState[]>([]);
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
  const unresolvedSendTab = computed(
    () => tabs.value.find(tab => tab.id === unresolvedSendId.value) ?? null,
  );

  function persistSession(): void {
    workspace.patchUiState({
      openTabs: tabs.value.map(tab => ({ path: tab.path, pinned: tab.pinned })),
      activeTabPath: activeId.value,
    });
  }

  function activate(id: string): void {
    activeId.value = id;
    persistSession();
  }

  /** Edição em qualquer campo marca suja e promove uma aba de preview a fixa. */
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

    const existing = tabs.value.find(tab => tab.path === path);
    if (existing) {
      if (pinned && !existing.pinned) existing.pinned = true;
      activate(existing.id);
      return;
    }

    const node = (await window.wttp.node.read({ root: workspace.root, path })) as RequestNode;
    if (!node.data) return;

    const newTab = buildTab(node, pinned);
    if (!pinned) {
      const previewIndex = tabs.value.findIndex(tab => !tab.pinned);
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

  /** Como `closeByPath`, mas também fecha abas de requests dentro de uma pasta excluída. */
  function closeUnderPath(path: string): void {
    const affected = tabs.value.filter(t => t.path === path || t.path.startsWith(`${path}/`));
    affected.forEach(t => forceClose(t.id));
  }

  /** A árvore renomeou o nó (EP-05-T03) — mantém a aba aberta apontando pro novo path. */
  function renamePath(oldPath: string, newPath: string, newName: string): void {
    const tab = tabs.value.find(t => t.path === oldPath);
    if (!tab) return;
    tab.path = newPath;
    tab.id = newPath;
    tab.title = newName;
    tab.originalData = { ...tab.originalData, name: newName };
    if (activeId.value === oldPath) activeId.value = newPath;
    persistSession();
  }

  async function save(id: string): Promise<void> {
    const tab = tabs.value.find(t => t.id === id);
    if (!tab || !workspace.root) return;

    const data: RequestFile = {
      ...unwrap(tab.originalData),
      method: tab.method,
      url: tab.url,
      query: unwrap(tab.query),
      headers: unwrap(tab.headers),
      auth: unwrap(tab.auth),
      body: unwrap(tab.body),
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
  }

  function saveActive(): Promise<void> {
    return activeId.value ? save(activeId.value) : Promise.resolve();
  }

  async function confirmCloseSave(): Promise<void> {
    if (!closeConfirmId.value) return;
    const id = closeConfirmId.value;
    await save(id);
    forceClose(id);
  }

  function confirmCloseDiscard(): void {
    if (closeConfirmId.value) forceClose(closeConfirmId.value);
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

  async function dispatch(
    tab: RequestTabState,
    resolved: ResolveRequestResultPayload,
  ): Promise<void> {
    const id = crypto.randomUUID();
    tab.requestId = id;
    tab.sending = true;

    try {
      const spec: HttpRequestSpec = {
        requestId: id,
        method: tab.method,
        url: resolved.url,
        query: resolved.query,
        headers: resolved.headers,
        auth: resolved.auth,
        body: resolved.body,
      };
      tab.lastResult = await window.wttp.http.send(spec);
    } finally {
      tab.sending = false;
      tab.requestId = null;
    }
  }

  /** Resolve `{{var}}` (EP-06-T01) antes de enviar; variável não resolvida pausa e pede confirmação em vez de mandar a request quebrada. */
  async function send(): Promise<void> {
    const tab = active.value;
    if (!tab || tab.sending) return;

    const resolved = await variables.resolveRequestSpec(
      { url: tab.url, query: tab.query, headers: tab.headers, auth: tab.auth, body: tab.body },
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

    const resolved = await variables.resolveRequestSpec(
      { url: tab.url, query: tab.query, headers: tab.headers, auth: tab.auth, body: tab.body },
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
    if (!tab?.sending || !tab.requestId) return;
    void window.wttp.http.cancel(tab.requestId);
  }

  async function saveResponseToFile(): Promise<SaveFileResult | null> {
    const result = active.value?.lastResult;
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

    const loaded: RequestTabState[] = [];
    for (const entry of state.openTabs) {
      try {
        const node = (await window.wttp.node.read({ root, path: entry.path })) as RequestNode;
        if (node.data) loaded.push(buildTab(node, entry.pinned));
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
    requestClose,
    forceClose,
    closeByPath,
    closeUnderPath,
    renamePath,
    save,
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

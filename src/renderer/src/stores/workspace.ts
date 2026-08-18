import type { RecentWorkspace, WorkspaceTree, WorkspaceUiState, WttpError } from "@shared";

import { defineStore } from "pinia";
import { computed, ref } from "vue";

const PERSIST_UI_STATE_DEBOUNCE_MS = 300;

const EMPTY_UI_STATE: WorkspaceUiState = {
  expandedPaths: [],
  openTabs: [],
  activeTabPath: null,
  activeEnvironment: null,
};

/**
 * Workspace atualmente aberto (EP-05-T01) — a raiz que toda a UI de collections/abas
 * passa a depender de existir antes de fazer sentido (`AppShell` mostra
 * `WorkspaceLanding` enquanto `root` for `null`).
 */
export const useWorkspaceStore = defineStore("workspace", () => {
  const tree = ref<WorkspaceTree | null>(null);
  const recents = ref<RecentWorkspace[]>([]);
  const loading = ref(false);
  const initialized = ref(false);
  const error = ref<WttpError | null>(null);
  /**
   * `.wttp/ui-state.json` do workspace aberto — pastas expandidas (EP-05-T02), abas
   * abertas (EP-05-T05). Único ponto de leitura/escrita: `useTreeStore` e
   * `useRequestTabsStore` só chamam `patchUiState`, nunca o IPC direto, para as duas
   * nunca se pisarem escrevendo o arquivo ao mesmo tempo.
   */
  const uiState = ref<WorkspaceUiState>(EMPTY_UI_STATE);
  /**
   * Incrementado só em `loadUiState` (nunca em `patchUiState`) — o sinal que
   * `useRequestTabsStore` observa para saber quando reidratar a sessão de abas de um
   * `.wttp/ui-state.json` recém-lido do disco, sem reagir ao próprio merge que
   * `patchUiState` faz a cada escrita (o que reidrataria as abas em cima de si mesmas).
   */
  const uiStateVersion = ref(0);

  const root = computed(() => tree.value?.root ?? null);
  /** `wttp.yaml` ausente ou inválido — a pasta aberta ainda não é um workspace de verdade. */
  const needsInit = computed(() => tree.value !== null && tree.value.data === null);
  /** Workspace válido e pronto para o shell de 3 painéis — falso enquanto `needsInit`. */
  const ready = computed(() => tree.value !== null && !needsInit.value);

  let stopWatchingChanges: (() => void) | null = null;
  let persistUiStateTimer: ReturnType<typeof setTimeout> | null = null;

  function watchChanges(): void {
    stopWatchingChanges?.();
    stopWatchingChanges = window.wttp.workspace.onChanged(event => {
      if (tree.value && event.tree.root === tree.value.root) tree.value = event.tree;
    });
  }

  /**
   * Rescan sem efeitos colaterais (não toca recentes, não reinicia o watcher) — usado
   * depois de um `node:*` que já sabemos que aconteceu, para não esperar o watcher (que
   * ignora nossa própria escrita, `writeTracker.ts`) refletir a mudança sozinho.
   */
  async function refreshTree(): Promise<void> {
    if (!root.value) return;
    tree.value = await window.wttp.workspace.rescan({ root: root.value });
  }

  async function loadUiState(): Promise<void> {
    if (!root.value) return;
    uiState.value = await window.wttp.workspace.getUiState({ root: root.value });
    uiStateVersion.value += 1;
  }

  /** Mescla `patch` no estado local e agenda a escrita em disco (debounced). */
  function patchUiState(patch: Partial<WorkspaceUiState>): void {
    if (!root.value) return;
    uiState.value = { ...uiState.value, ...patch };

    const currentRoot = root.value;
    const nextState = uiState.value;
    if (persistUiStateTimer) clearTimeout(persistUiStateTimer);
    persistUiStateTimer = setTimeout(() => {
      void window.wttp.workspace.setUiState({ root: currentRoot, state: nextState });
    }, PERSIST_UI_STATE_DEBOUNCE_MS);
  }

  async function refreshRecents(): Promise<void> {
    recents.value = await window.wttp.workspace.recent();
  }

  /** Chamado uma vez no bootstrap: carrega recentes e reabre o último workspace, se existir. */
  async function init(): Promise<void> {
    if (initialized.value) return;
    initialized.value = true;

    await refreshRecents();
    const mostRecent = recents.value.find(entry => !entry.missing);
    if (mostRecent) await open(mostRecent.path);
  }

  async function open(path?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const opened = await window.wttp.workspace.open(path ? { path } : {});
      if (opened) {
        tree.value = opened;
        watchChanges();
        await loadUiState();
      }
      await refreshRecents();
    } catch (e) {
      error.value = e as WttpError;
    } finally {
      loading.value = false;
    }
  }

  async function create(path: string, name: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      tree.value = await window.wttp.workspace.create({ path, name });
      watchChanges();
      await loadUiState();
      await refreshRecents();
    } catch (e) {
      error.value = e as WttpError;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Abre o diálogo nativo de pasta — usado pelo fluxo de "Criar workspace" antes de
   * nomear. `defaultPath` (EP-06.1) é o diretório padrão configurado em Settings, se
   * houver — sem ele, o diálogo abre onde o SO decidir, comportamento de sempre.
   */
  async function pickFolder(defaultPath?: string): Promise<string | null> {
    const result = await window.wttp.dialog.pickFolder({ defaultPath });
    return result.canceled ? null : (result.path ?? null);
  }

  async function removeRecent(path: string): Promise<void> {
    recents.value = await window.wttp.workspace.removeRecent({ path });
  }

  function close(): void {
    stopWatchingChanges?.();
    stopWatchingChanges = null;
    if (persistUiStateTimer) clearTimeout(persistUiStateTimer);
    persistUiStateTimer = null;
    tree.value = null;
    uiState.value = EMPTY_UI_STATE;
    uiStateVersion.value = 0;
  }

  return {
    tree,
    recents,
    loading,
    error,
    uiState,
    uiStateVersion,
    root,
    needsInit,
    ready,
    init,
    open,
    create,
    pickFolder,
    removeRecent,
    patchUiState,
    refreshTree,
    close,
  };
});

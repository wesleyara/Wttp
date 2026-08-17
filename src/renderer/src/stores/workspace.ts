import type { RecentWorkspace, WorkspaceTree, WttpError } from "@shared";

import { defineStore } from "pinia";
import { computed, ref } from "vue";

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

  const root = computed(() => tree.value?.root ?? null);
  /** `wttp.yaml` ausente ou inválido — a pasta aberta ainda não é um workspace de verdade. */
  const needsInit = computed(() => tree.value !== null && tree.value.data === null);
  /** Workspace válido e pronto para o shell de 3 painéis — falso enquanto `needsInit`. */
  const ready = computed(() => tree.value !== null && !needsInit.value);

  let stopWatchingChanges: (() => void) | null = null;

  function watchChanges(): void {
    stopWatchingChanges?.();
    stopWatchingChanges = window.wttp.workspace.onChanged(event => {
      if (tree.value && event.tree.root === tree.value.root) tree.value = event.tree;
    });
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
      await refreshRecents();
    } catch (e) {
      error.value = e as WttpError;
    } finally {
      loading.value = false;
    }
  }

  /** Abre o diálogo nativo de pasta — usado pelo fluxo de "Criar workspace" antes de nomear. */
  async function pickFolder(): Promise<string | null> {
    const result = await window.wttp.dialog.pickFolder();
    return result.canceled ? null : (result.path ?? null);
  }

  async function removeRecent(path: string): Promise<void> {
    recents.value = await window.wttp.workspace.removeRecent({ path });
  }

  function close(): void {
    stopWatchingChanges?.();
    stopWatchingChanges = null;
    tree.value = null;
  }

  return {
    tree,
    recents,
    loading,
    error,
    root,
    needsInit,
    ready,
    init,
    open,
    create,
    pickFolder,
    removeRecent,
    close,
  };
});

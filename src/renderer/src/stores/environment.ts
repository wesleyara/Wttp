import type { EnvironmentListItem, KeyValueEntry, WttpError } from "@shared";

import { i18n } from "@renderer/i18n";
import { defineStore } from "pinia";
import { computed, ref, toRaw, watch } from "vue";

import { useToastStore } from "./toast";
import { useWorkspaceStore } from "./workspace";

/** Tira a reatividade do Pinia/componente antes de cruzar a ponte de IPC — Proxy reativo não é clonável pelo Electron. */
function unwrap<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T;
}

export interface SaveVariableInput {
  name: string;
  enabled: boolean;
  description?: string;
  secret?: boolean;
  value?: string;
}

/**
 * Environments do workspace aberto (EP-06-T02/T03) e o environment ativo (EP-06-T04),
 * cuja escolha vive em `.wttp/ui-state.json` (`useWorkspaceStore.uiState`), não aqui —
 * mesmo dono único de escrita desse arquivo que `useRequestTabsStore` já respeita.
 */
export const useEnvironmentStore = defineStore("environment", () => {
  const workspace = useWorkspaceStore();
  const toast = useToastStore();

  const items = ref<EnvironmentListItem[]>([]);
  const loading = ref(false);
  const error = ref<WttpError | null>(null);

  const activePath = computed(() => workspace.uiState.activeEnvironment);
  const active = computed(() => items.value.find(item => item.path === activePath.value) ?? null);

  async function refresh(): Promise<void> {
    if (!workspace.root) return;
    loading.value = true;
    try {
      items.value = await window.wttp.env.list({ root: workspace.root });
      error.value = null;
      applyDefaultEnvironment();
    } catch (e) {
      error.value = e as WttpError;
    } finally {
      loading.value = false;
    }
  }

  /** `defaultEnvironment` do `wttp.yaml` (arch-docs/file-format.md §2) respeitado ao abrir — só quando nenhum environment já foi escolhido para este workspace. */
  function applyDefaultEnvironment(): void {
    if (workspace.uiState.activeEnvironment !== null) return;
    const defaultName = workspace.tree?.data?.defaultEnvironment;
    if (!defaultName) return;
    const match = items.value.find(item => item.data.name === defaultName);
    if (match) setActive(match.path);
  }

  function setActive(path: string | null): void {
    workspace.patchUiState({ activeEnvironment: path });
  }

  async function create(name: string): Promise<EnvironmentListItem | null> {
    if (!workspace.root) return null;
    try {
      const created = await window.wttp.env.save({ root: workspace.root, name, variables: [] });
      await refresh();
      error.value = null;
      return created;
    } catch (e) {
      error.value = e as WttpError;
      return null;
    }
  }

  async function save(
    path: string | undefined,
    name: string,
    variables: SaveVariableInput[],
  ): Promise<EnvironmentListItem | null> {
    if (!workspace.root) return null;
    try {
      const saved = await window.wttp.env.save({
        root: workspace.root,
        path,
        name,
        variables: unwrap(variables),
      });
      // O arquivo acompanha o nome (card #154): se o `path` mudou, o ativo vai junto.
      if (path !== undefined && path !== saved.path && activePath.value === path) {
        setActive(saved.path);
      }
      await refresh();
      error.value = null;
      toast.push(i18n.global.t("toast.saved", { name: saved.data.name }), "success");
      return saved;
    } catch (e) {
      error.value = e as WttpError;
      return null;
    }
  }

  async function remove(path: string): Promise<void> {
    if (!workspace.root) return;
    const name = items.value.find(item => item.path === path)?.data.name ?? "Environment";
    try {
      await window.wttp.env.delete({ root: workspace.root, path });
      if (activePath.value === path) setActive(null);
      await refresh();
      error.value = null;
      toast.push(i18n.global.t("toast.deleted", { name }), "warning");
    } catch (e) {
      error.value = e as WttpError;
    }
  }

  /** Duplica sem copiar valor de variável secreta (arch-docs/backlog EP-06-T03) — a store só chama o IPC, o aviso ao usuário é responsabilidade do componente, que já sabe se o original tem segredos. */
  async function duplicate(path: string): Promise<EnvironmentListItem | null> {
    if (!workspace.root) return null;
    try {
      const created = await window.wttp.env.duplicate({ root: workspace.root, path });
      await refresh();
      error.value = null;
      return created;
    } catch (e) {
      error.value = e as WttpError;
      return null;
    }
  }

  /** Variáveis globais do workspace — aba separada no editor (EP-06-T03), vivem em `wttp.yaml`, não em `environments/`. */
  async function saveWorkspaceVariables(variables: KeyValueEntry[]): Promise<void> {
    if (!workspace.root) return;
    try {
      workspace.tree = await window.wttp.workspace.setVariables({
        root: workspace.root,
        variables: unwrap(variables),
      });
      error.value = null;
      toast.push(i18n.global.t("toast.workspaceVariablesSaved"), "success");
    } catch (e) {
      error.value = e as WttpError;
    }
  }

  // Trocar (ou fechar) de workspace descarta a lista do anterior e recarrega a do novo
  // — mesmo padrão de `useTreeStore` para `workspace.root`.
  watch(
    () => workspace.root,
    root => {
      if (root) void refresh();
      else items.value = [];
    },
  );

  return {
    items,
    loading,
    error,
    activePath,
    active,
    refresh,
    setActive,
    create,
    save,
    remove,
    duplicate,
    saveWorkspaceVariables,
  };
});

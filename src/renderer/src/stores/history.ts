import type { HistoryEntry } from "@shared";

import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

/**
 * Histórico de execuções por request (EP-08.1-T04), lido de `.wttp/history/<slug>.json`
 * (EP-08.1-T03) — carregado por `path` de request, um só de cada vez (`ResponsePanel`
 * recarrega toda vez que a aba ativa muda, `watch(() => store.path, ...)`).
 */
export const useHistoryStore = defineStore("history", () => {
  const workspace = useWorkspaceStore();

  const path = ref<string | null>(null);
  const entries = ref<HistoryEntry[]>([]);

  async function loadFor(requestPath: string | null): Promise<void> {
    path.value = requestPath;
    // Limpa na hora, antes do IPC resolver — sem isso, trocar de aba deixaria as
    // entradas da request anterior visíveis por um instante (`ResponsePanel` já usa a
    // mais recente como fallback de Body/Headers/Cookies, EP-08.1-T04, então mostrar a
    // resposta errada nem que seja por um instante é pior que uma tela vazia).
    entries.value = [];
    if (!workspace.root || !requestPath) return;
    entries.value = await window.wttp.history.list({ root: workspace.root, path: requestPath });
  }

  async function clear(): Promise<void> {
    if (!workspace.root || !path.value) return;
    await window.wttp.history.clear({ root: workspace.root, path: path.value });
    entries.value = [];
  }

  /** Caminhos ignorados no diff de respostas desta request (#49), guardados em `.wttp/ui-state.json`. */
  const diffIgnores = computed<string[]>(() =>
    path.value ? (workspace.uiState.responseDiffIgnores?.[path.value] ?? []) : [],
  );

  function setDiffIgnores(next: string[]): void {
    if (!path.value) return;
    const all = { ...workspace.uiState.responseDiffIgnores };
    if (next.length > 0) all[path.value] = next;
    else delete all[path.value];
    workspace.patchUiState({ responseDiffIgnores: all });
  }

  function addDiffIgnore(pattern: string): void {
    if (!diffIgnores.value.includes(pattern)) setDiffIgnores([...diffIgnores.value, pattern]);
  }

  function removeDiffIgnore(pattern: string): void {
    setDiffIgnores(diffIgnores.value.filter(item => item !== pattern));
  }

  return { path, entries, loadFor, clear, diffIgnores, addDiffIgnore, removeDiffIgnore };
});

import type { HistoryEntry } from "@shared";

import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { ref } from "vue";

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

  return { path, entries, loadFor, clear };
});

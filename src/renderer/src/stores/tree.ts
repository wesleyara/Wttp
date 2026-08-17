import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

/**
 * Estado de navegação do `WTree` (EP-05-T02). `expandedPaths` é derivado direto de
 * `workspaceStore.uiState` — nunca uma cópia local — porque `patchUiState` já é o
 * único ponto de escrita em `.wttp/ui-state.json`; duplicar o estado aqui arriscaria
 * as duas stores divergirem sobre o que está expandido. `selectedPath`/`filterText`
 * são efêmeros (não sobrevivem a um restart), então continuam como refs simples.
 */
export const useTreeStore = defineStore("tree", () => {
  const workspace = useWorkspaceStore();

  const selectedPath = ref<string | null>(null);
  const filterText = ref("");

  const expandedPaths = computed<Set<string>>(() => new Set(workspace.uiState.expandedPaths));

  function setExpandedPaths(paths: Set<string>): void {
    workspace.patchUiState({ expandedPaths: [...paths] });
  }

  function toggleExpanded(path: string): void {
    const next = new Set(expandedPaths.value);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpandedPaths(next);
  }

  // Trocar de workspace (ou fechar) descarta seleção e filtro do anterior — não fazem
  // sentido apontando para uma árvore que não existe mais.
  watch(
    () => workspace.root,
    () => {
      selectedPath.value = null;
      filterText.value = "";
    },
  );

  return {
    selectedPath,
    filterText,
    expandedPaths,
    setExpandedPaths,
    toggleExpanded,
  };
});

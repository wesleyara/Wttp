import type { WorkspaceNode } from "@shared";

import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

function findNode(nodes: WorkspaceNode[], path: string): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.kind === "folder") {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

/** Quantos nós (pastas + requests) seriam apagados junto com `node` — para o aviso de exclusão. */
function countDescendants(node: WorkspaceNode): number {
  if (node.kind !== "folder") return 0;
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function parentDirOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export interface ContextMenuTarget {
  node: WorkspaceNode;
  x: number;
  y: number;
}

export interface DeleteTarget {
  node: WorkspaceNode;
  descendantCount: number;
}

/**
 * Estado de navegação e CRUD do `WTree` (EP-05-T02/T03). `expandedPaths` é derivado
 * direto de `workspaceStore.uiState` — nunca uma cópia local — porque `patchUiState`
 * já é o único ponto de escrita em `.wttp/ui-state.json`. `selectedPath`/`filterText`/
 * `editingPath` são efêmeros (não sobrevivem a um restart).
 */
export const useTreeStore = defineStore("tree", () => {
  const workspace = useWorkspaceStore();

  const selectedPath = ref<string | null>(null);
  const filterText = ref("");
  const editingPath = ref<string | null>(null);
  const contextMenuTarget = ref<ContextMenuTarget | null>(null);
  const deleteTarget = ref<DeleteTarget | null>(null);

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

  function ensureExpanded(path: string): void {
    if (!path || expandedPaths.value.has(path)) return;
    setExpandedPaths(new Set([...expandedPaths.value, path]));
  }

  /** Pasta selecionada, ou a pasta-mãe de uma request selecionada — raiz se nada estiver selecionado. */
  function defaultParentPath(): string {
    if (!selectedPath.value || !workspace.tree) return "";
    const selected = findNode(workspace.tree.children, selectedPath.value);
    if (!selected) return "";
    return selected.kind === "folder" ? selected.path : parentDirOf(selected.path);
  }

  async function createRequest(parentPath?: string): Promise<void> {
    if (!workspace.root) return;
    const target = parentPath ?? defaultParentPath();
    const node = await window.wttp.node.create({
      root: workspace.root,
      parentPath: target,
      kind: "request",
      name: "New request",
    });
    ensureExpanded(target);
    await workspace.refreshTree();
    selectedPath.value = node.path;
    editingPath.value = node.path;
  }

  async function createFolder(parentPath?: string): Promise<void> {
    if (!workspace.root) return;
    const target = parentPath ?? defaultParentPath();
    const node = await window.wttp.node.create({
      root: workspace.root,
      parentPath: target,
      kind: "folder",
      name: "New folder",
    });
    ensureExpanded(target);
    await workspace.refreshTree();
    selectedPath.value = node.path;
    editingPath.value = node.path;
  }

  function startRename(path: string): void {
    editingPath.value = path;
  }

  function cancelRename(): void {
    editingPath.value = null;
  }

  async function confirmRename(path: string, name: string): Promise<void> {
    if (!workspace.root) return;
    editingPath.value = null;
    const node = await window.wttp.node.rename({ root: workspace.root, path, name });
    await workspace.refreshTree();
    selectedPath.value = node.path;
  }

  async function duplicate(path: string): Promise<void> {
    if (!workspace.root) return;
    const node = await window.wttp.node.duplicate({ root: workspace.root, path });
    await workspace.refreshTree();
    selectedPath.value = node.path;
  }

  function openContextMenu(node: WorkspaceNode, event: MouseEvent): void {
    selectedPath.value = node.path;
    contextMenuTarget.value = { node, x: event.clientX, y: event.clientY };
  }

  function closeContextMenu(): void {
    contextMenuTarget.value = null;
  }

  function requestDelete(node: WorkspaceNode): void {
    deleteTarget.value = { node, descendantCount: countDescendants(node) };
  }

  function cancelDelete(): void {
    deleteTarget.value = null;
  }

  async function confirmDelete(): Promise<void> {
    if (!workspace.root || !deleteTarget.value) return;
    const path = deleteTarget.value.node.path;
    await window.wttp.node.trash({ root: workspace.root, path });
    deleteTarget.value = null;
    if (selectedPath.value === path) selectedPath.value = null;
    await workspace.refreshTree();
  }

  async function reveal(path: string): Promise<void> {
    if (!workspace.root) return;
    await window.wttp.node.reveal({ root: workspace.root, path });
  }

  function onShortcut(type: "rename" | "duplicate" | "delete", node: WorkspaceNode): void {
    if (type === "rename") startRename(node.path);
    else if (type === "duplicate") void duplicate(node.path);
    else requestDelete(node);
  }

  // Trocar de workspace (ou fechar) descarta seleção, filtro e menus do anterior — não
  // fazem sentido apontando para uma árvore que não existe mais.
  watch(
    () => workspace.root,
    () => {
      selectedPath.value = null;
      filterText.value = "";
      editingPath.value = null;
      contextMenuTarget.value = null;
      deleteTarget.value = null;
    },
  );

  return {
    selectedPath,
    filterText,
    editingPath,
    expandedPaths,
    contextMenuTarget,
    deleteTarget,
    setExpandedPaths,
    toggleExpanded,
    createRequest,
    createFolder,
    startRename,
    cancelRename,
    confirmRename,
    duplicate,
    openContextMenu,
    closeContextMenu,
    requestDelete,
    cancelDelete,
    confirmDelete,
    reveal,
    onShortcut,
  };
});

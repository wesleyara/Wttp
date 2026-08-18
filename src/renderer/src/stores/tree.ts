import type { AuthConfig, FolderFile, FolderNode, WorkspaceNode } from "@shared";

import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useToastStore } from "@renderer/stores/toast";
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
  const requestTabs = useRequestTabsStore();
  const toast = useToastStore();

  const selectedPath = ref<string | null>(null);
  const filterText = ref("");
  const editingPath = ref<string | null>(null);
  const contextMenuTarget = ref<ContextMenuTarget | null>(null);
  const deleteTarget = ref<DeleteTarget | null>(null);

  /** Pasta/collection sendo editada no `FolderAuthModal` (EP-07-T03) — `null` = modal fechado. */
  const authEditNode = ref<FolderNode | null>(null);
  /** `authEditNode.value.data`, ou um `FolderFile` mínimo quando a pasta ainda não tem `folder.yaml` — nunca `null` com o modal aberto. */
  const authEditData = ref<FolderFile | null>(null);
  const authEditPath = computed(() => authEditNode.value?.path ?? null);

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
    toast.push("Request created", "success");
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
    toast.push("Folder created", "success");
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
    if (node.kind === "request") requestTabs.renamePath(path, node.path, node.name);
  }

  async function duplicate(path: string): Promise<void> {
    if (!workspace.root) return;
    const node = await window.wttp.node.duplicate({ root: workspace.root, path });
    await workspace.refreshTree();
    selectedPath.value = node.path;
  }

  /** Abre o `FolderAuthModal` (EP-07-T03) — relê o nó para pegar `folder.yaml` mais recente, mesmo cuidado de `save()` em `requestTabs.ts`. */
  async function openAuthEditor(node: WorkspaceNode): Promise<void> {
    if (node.kind !== "folder" || !workspace.root) return;
    const fresh = (await window.wttp.node.read({
      root: workspace.root,
      path: node.path,
    })) as FolderNode;
    authEditNode.value = fresh;
    authEditData.value = fresh.data ?? {
      wttp: 1,
      name: fresh.name,
      seq: fresh.seq,
      auth: { type: "inherit" },
    };
  }

  function closeAuthEditor(): void {
    authEditNode.value = null;
    authEditData.value = null;
  }

  /** Grava `folder.yaml` com a nova auth, preservando `variables`/`docs`/campos desconhecidos já presentes. */
  async function saveFolderAuth(auth: AuthConfig): Promise<void> {
    if (!workspace.root || !authEditNode.value || !authEditData.value) return;
    const data: FolderFile = { ...authEditData.value, auth };
    const node: FolderNode = { ...authEditNode.value, data };
    await window.wttp.node.write({ root: workspace.root, path: node.path, node });
    const name = authEditNode.value.name;
    closeAuthEditor();
    await workspace.refreshTree();
    toast.push(`Auth updated for "${name}"`, "success");
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
    const { node } = deleteTarget.value;
    const path = node.path;
    await window.wttp.node.trash({ root: workspace.root, path });
    deleteTarget.value = null;
    if (selectedPath.value === path) selectedPath.value = null;
    requestTabs.closeUnderPath(path);
    await workspace.refreshTree();
    toast.push(`"${node.name}" deleted`, "warning");
  }

  /**
   * Drag & drop soltou `from` dentro de `targetDir`, na posição `index` (EP-05-T04).
   * Só a aba do próprio nó movido é resincronizada — mover uma pasta com abas abertas
   * em requests aninhadas mais fundo não reatribui o path delas (limitação conhecida,
   * a próxima leitura/gravação dessas abas específicas falharia; registrado ao fechar
   * a task em vez de corrigido em silêncio).
   */
  async function moveInto(from: string, targetDir: string, index: number): Promise<void> {
    if (!workspace.root) return;
    const node = await window.wttp.node.moveInto({ root: workspace.root, from, targetDir, index });
    await workspace.refreshTree();
    selectedPath.value = node.path;
    if (node.kind === "request") requestTabs.renamePath(from, node.path, node.name);
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
      authEditNode.value = null;
      authEditData.value = null;
    },
  );

  return {
    selectedPath,
    filterText,
    editingPath,
    expandedPaths,
    contextMenuTarget,
    deleteTarget,
    authEditNode,
    authEditData,
    authEditPath,
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
    moveInto,
    reveal,
    onShortcut,
    openAuthEditor,
    closeAuthEditor,
    saveFolderAuth,
  };
});

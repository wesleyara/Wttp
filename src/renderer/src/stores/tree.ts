import type { WorkspaceNode } from "@shared";

import { i18n } from "@renderer/i18n";
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

/** Pasta na raiz do workspace (sem `/` no path) — rótulo "Collection" na UI (mesma convenção de `useRequestTabsStore.isCollectionPath`). */
function isCollectionPath(path: string): boolean {
  return path !== "" && !path.includes("/");
}

/**
 * Destino válido para mover/copiar `node` para `targetPath` (EP-09.1-T04): nem ele
 * mesmo, nem um dos seus próprios descendentes (só relevante para pastas), e uma
 * collection nunca entra em outra pasta — só requests e subpastas podem mudar de lugar.
 */
export function isValidMoveCopyDestination(node: WorkspaceNode, targetPath: string): boolean {
  if (node.path === targetPath) return false;
  if (node.kind === "folder" && isDescendantOrSelf(node.path, targetPath)) return false;
  if (node.kind === "folder" && isCollectionPath(node.path)) return false;
  return true;
}

function isDescendantOrSelf(ancestorPath: string, path: string): boolean {
  return path === ancestorPath || path.startsWith(`${ancestorPath}/`);
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
  /** Seleção múltipla via Ctrl/Cmd+click (EP-09.1-T03) — `selectedPath` continua sendo o item "ativo" dentro dela, para compatibilidade com quem só lê seleção única. Vazio fora de uma seleção múltipla. */
  const selectedPaths = ref<Set<string>>(new Set());
  const filterText = ref("");
  const editingPath = ref<string | null>(null);
  const contextMenuTarget = ref<ContextMenuTarget | null>(null);
  const deleteTarget = ref<DeleteTarget | null>(null);
  /** "Mover para..."/"Copiar para..." pendente (EP-09.1-T04) — `null` fora do seletor de destino. */
  const moveCopyTarget = ref<{ paths: string[]; mode: "move" | "copy" } | null>(null);

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
    toast.push(i18n.global.t("toast.requestCreated"), "success");
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
    toast.push(i18n.global.t("toast.folderCreated"), "success");
  }

  /** Como `createFolder`, mas sempre na raiz do workspace — "New collection" no menu "+" (EP-07.1), independente da seleção atual na árvore. */
  async function createCollection(): Promise<void> {
    if (!workspace.root) return;
    const node = await window.wttp.node.create({
      root: workspace.root,
      parentPath: "",
      kind: "folder",
      name: "New collection",
    });
    await workspace.refreshTree();
    selectedPath.value = node.path;
    editingPath.value = node.path;
    toast.push(i18n.global.t("toast.collectionCreated"), "success");
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
    // Request ou pasta/collection: as duas podem ter aba aberta (EP-07.1) — `renamePath`
    // é um no-op se nenhuma aba apontar para `path`.
    requestTabs.renamePath(path, node.path, node.name);
  }

  async function duplicate(path: string): Promise<void> {
    if (!workspace.root) return;
    const node = await window.wttp.node.duplicate({ root: workspace.root, path });
    await workspace.refreshTree();
    selectedPath.value = node.path;
  }

  /** Nó da árvore atual num `path` — usado pelo seletor de destino para validar cada item de `moveCopyTarget.paths`. */
  function nodeAt(path: string): WorkspaceNode | null {
    return workspace.tree ? findNode(workspace.tree.children, path) : null;
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
    toast.push(i18n.global.t("toast.deleted", { name: node.name }), "warning");
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
    requestTabs.renamePath(from, node.path, node.name);
  }

  /**
   * Como `moveInto`, para uma seleção múltipla (EP-09.1-T03) — move um de cada vez,
   * sempre para o fim de `targetDir`; um índice grande de propósito, clampeado pelo
   * main (`storage/tree.ts`) ao tamanho real da pasta destino a cada chamada, então
   * cada item entra depois do anterior.
   */
  async function moveManyInto(paths: string[], targetDir: string): Promise<void> {
    if (!workspace.root) return;
    for (const path of paths) {
      const node = await window.wttp.node.moveInto({
        root: workspace.root,
        from: path,
        targetDir,
        index: Number.MAX_SAFE_INTEGER,
      });
      requestTabs.renamePath(path, node.path, node.name);
    }
    selectedPaths.value = new Set();
    await workspace.refreshTree();
  }

  /** Abre o seletor de destino (EP-09.1-T04) — aplica a toda a seleção múltipla se `node` fizer parte dela, senão só a `node`. */
  function openMoveCopy(node: WorkspaceNode, mode: "move" | "copy"): void {
    const paths =
      selectedPaths.value.has(node.path) && selectedPaths.value.size > 1
        ? [...selectedPaths.value]
        : [node.path];
    moveCopyTarget.value = { paths, mode };
  }

  function closeMoveCopy(): void {
    moveCopyTarget.value = null;
  }

  /** Confirma "Mover para..."/"Copiar para..." com o destino escolhido no seletor. */
  async function confirmMoveCopyTo(targetPath: string): Promise<void> {
    if (!workspace.root || !moveCopyTarget.value) return;
    const { paths, mode } = moveCopyTarget.value;
    moveCopyTarget.value = null;

    if (mode === "move") {
      if (paths.length > 1) {
        await moveManyInto(paths, targetPath);
      } else {
        const node = await window.wttp.node.moveInto({
          root: workspace.root,
          from: paths[0],
          targetDir: targetPath,
          index: Number.MAX_SAFE_INTEGER,
        });
        requestTabs.renamePath(paths[0], node.path, node.name);
        await workspace.refreshTree();
      }
    } else {
      for (const path of paths) {
        await window.wttp.node.copyInto({
          root: workspace.root,
          from: path,
          targetDir: targetPath,
        });
      }
      await workspace.refreshTree();
    }

    selectedPaths.value = new Set();
    toast.push(i18n.global.t(mode === "move" ? "toast.moved" : "toast.copied"), "success");
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
      selectedPaths.value = new Set();
      filterText.value = "";
      editingPath.value = null;
      contextMenuTarget.value = null;
      deleteTarget.value = null;
      moveCopyTarget.value = null;
    },
  );

  return {
    selectedPath,
    selectedPaths,
    filterText,
    editingPath,
    expandedPaths,
    contextMenuTarget,
    deleteTarget,
    moveCopyTarget,
    setExpandedPaths,
    toggleExpanded,
    createRequest,
    createFolder,
    createCollection,
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
    moveManyInto,
    nodeAt,
    openMoveCopy,
    closeMoveCopy,
    confirmMoveCopyTo,
    reveal,
    onShortcut,
  };
});

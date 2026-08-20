<script setup lang="ts">
import type { WorkspaceNode } from "@shared";

import { isValidMoveCopyDestination, useTreeStore } from "@renderer/stores/tree";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, ref, watch } from "vue";

import WButton from "./WButton.vue";
import WIcon from "./WIcon.vue";
import WModal from "./WModal.vue";

const workspace = useWorkspaceStore();
const tree = useTreeStore();

interface FolderRow {
  node: WorkspaceNode;
  depth: number;
  disabled: boolean;
}

/** Achata todas as pastas/collections do workspace, numa ordem de árvore — a mesma lista serve para "Mover para..." e "Copiar para...". */
const rows = computed<FolderRow[]>(() => {
  const target = tree.moveCopyTarget;
  if (!target || !workspace.tree) return [];

  const sourceNodes = target.paths
    .map(path => tree.nodeAt(path))
    .filter((n): n is WorkspaceNode => n !== null);

  const result: FolderRow[] = [];
  function walk(node: WorkspaceNode, depth: number): void {
    if (node.kind !== "folder") return;
    const disabled = sourceNodes.some(source => !isValidMoveCopyDestination(source, node.path));
    result.push({ node, depth, disabled });
    node.children.forEach(child => walk(child, depth + 1));
  }
  workspace.tree.children.forEach(node => walk(node, 0));
  return result;
});

const selectedTarget = ref<string | null>(null);

watch(
  () => tree.moveCopyTarget,
  () => {
    selectedTarget.value = null;
  },
);

function confirm(): void {
  if (selectedTarget.value === null) return;
  void tree.confirmMoveCopyTo(selectedTarget.value);
}
</script>

<template>
  <WModal
    :open="tree.moveCopyTarget !== null"
    :title="tree.moveCopyTarget?.mode === 'copy' ? 'Copy to…' : 'Move to…'"
    @close="tree.closeMoveCopy"
  >
    <div class="flex flex-col gap-1">
      <p v-if="rows.length === 0" class="p-2 font-inter text-xs text-faint">
        No collections or folders yet.
      </p>
      <button
        v-for="row in rows"
        :key="row.node.path"
        type="button"
        class="flex items-center gap-1.5 rounded px-2 py-1.5 text-left font-inter text-sm disabled:cursor-not-allowed disabled:opacity-40"
        :class="
          selectedTarget === row.node.path ? 'bg-accent/20 text-1' : 'text-muted hover:bg-surface-3'
        "
        :style="{ paddingLeft: `${row.depth * 16 + 8}px` }"
        :disabled="row.disabled"
        @click="selectedTarget = row.node.path"
      >
        <WIcon name="folder" size="3.5" class="shrink-0 text-faint" />
        {{ row.node.name }}
      </button>
    </div>

    <template #footer>
      <WButton variant="ghost" @click="tree.closeMoveCopy">Cancel</WButton>
      <WButton variant="primary" :disabled="selectedTarget === null" @click="confirm">
        {{ tree.moveCopyTarget?.mode === "copy" ? "Copy" : "Move" }}
      </WButton>
    </template>
  </WModal>
</template>

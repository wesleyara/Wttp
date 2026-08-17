<script setup lang="ts">
import type { WorkspaceNode } from "@shared";

import WInput from "@renderer/components/WInput.vue";
import WMethodBadge from "@renderer/components/WMethodBadge.vue";
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";

/** Altura de linha fixa (docs/design-system.md §4) — base da virtualização por janela. */
const ROW_HEIGHT = 28;
/** Linhas extras renderizadas acima/abaixo da viewport, para rolagem sem "pop-in". */
const OVERSCAN = 8;
/** Janela de tempo entre teclas digitadas para o mesmo salto "digitar para navegar". */
const TYPEAHEAD_RESET_MS = 600;

interface Row {
  node: WorkspaceNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

const props = withDefaults(
  defineProps<{
    nodes: WorkspaceNode[];
    expandedPaths: Set<string>;
    selectedPath: string | null;
    filterText?: string;
    /** Path do nó em edição inline de nome — `null` quando nada está sendo renomeado. */
    editingPath?: string | null;
  }>(),
  { filterText: "", editingPath: null },
);

const emit = defineEmits<{
  "update:expandedPaths": [paths: Set<string>];
  "update:selectedPath": [path: string | null];
  activate: [node: WorkspaceNode];
  contextmenu: [node: WorkspaceNode, event: MouseEvent];
  rename: [path: string, name: string];
  "cancel-rename": [];
  shortcut: [type: "rename" | "duplicate" | "delete", node: WorkspaceNode];
}>();

const editingValue = ref("");

const containerRef = useTemplateRef<HTMLElement>("container");
const scrollTop = ref(0);
const containerHeight = ref(0);

function onScroll(event: Event): void {
  scrollTop.value = (event.target as HTMLElement).scrollTop;
}

function measure(): void {
  containerHeight.value = containerRef.value?.clientHeight ?? 0;
}

let resizeObserver: ResizeObserver | null = null;
watch(containerRef, el => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (!el) return;
  measure();
  resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(el);
});

const filterActive = computed(() => props.filterText.trim().length > 0);
const filterLower = computed(() => props.filterText.trim().toLowerCase());

function nodeMatches(node: WorkspaceNode): boolean {
  return node.name.toLowerCase().includes(filterLower.value);
}

function subtreeHasMatch(node: WorkspaceNode): boolean {
  if (nodeMatches(node)) return true;
  return node.kind === "folder" && node.children.some(subtreeHasMatch);
}

/** Achata a árvore visível — respeita expansão (ou força tudo aberto durante filtro). */
const rows = computed<Row[]>(() => {
  const result: Row[] = [];

  function walk(node: WorkspaceNode, depth: number): void {
    if (filterActive.value) {
      const selfMatch = nodeMatches(node);
      if (node.kind === "folder") {
        const anyMatch = selfMatch || node.children.some(subtreeHasMatch);
        if (!anyMatch) return;
        result.push({ node, depth, hasChildren: node.children.length > 0, expanded: true });
        node.children.forEach(child => walk(child, depth + 1));
      } else if (selfMatch) {
        result.push({ node, depth, hasChildren: false, expanded: false });
      }
      return;
    }

    const hasChildren = node.kind === "folder" && node.children.length > 0;
    const expanded = node.kind === "folder" && props.expandedPaths.has(node.path);
    result.push({ node, depth, hasChildren, expanded });
    if (expanded && node.kind === "folder") node.children.forEach(child => walk(child, depth + 1));
  }

  props.nodes.forEach(node => walk(node, 0));
  return result;
});

const selectedIndex = computed(() =>
  rows.value.findIndex(row => row.node.path === props.selectedPath),
);

const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN));
const visibleCount = computed(() => Math.ceil(containerHeight.value / ROW_HEIGHT) + OVERSCAN * 2);
const endIndex = computed(() => Math.min(rows.value.length, startIndex.value + visibleCount.value));
const visibleRows = computed(() => rows.value.slice(startIndex.value, endIndex.value));
const offsetY = computed(() => startIndex.value * ROW_HEIGHT);
const totalHeight = computed(() => rows.value.length * ROW_HEIGHT);

watch(
  () => props.editingPath,
  async path => {
    if (!path) return;
    const index = rows.value.findIndex(r => r.node.path === path);
    if (index === -1) return;
    editingValue.value = rows.value[index].node.name;
    scrollToIndex(index);
    await nextTick();
    containerRef.value?.querySelector<HTMLInputElement>("input")?.focus();
  },
);

function confirmRename(): void {
  if (!props.editingPath) return;
  const trimmed = editingValue.value.trim();
  if (trimmed) emit("rename", props.editingPath, trimmed);
  else emit("cancel-rename");
}

function cancelRename(): void {
  emit("cancel-rename");
}

function onRowContextmenu(node: WorkspaceNode, event: MouseEvent): void {
  event.preventDefault();
  select(node.path);
  emit("contextmenu", node, event);
}

function toggleExpanded(path: string): void {
  const next = new Set(props.expandedPaths);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  emit("update:expandedPaths", next);
}

function select(path: string): void {
  emit("update:selectedPath", path);
}

function activate(node: WorkspaceNode): void {
  if (node.kind === "folder") toggleExpanded(node.path);
  else emit("activate", node);
}

function scrollToIndex(index: number): void {
  const el = containerRef.value;
  if (!el) return;
  const top = index * ROW_HEIGHT;
  const bottom = top + ROW_HEIGHT;
  if (top < el.scrollTop) el.scrollTop = top;
  else if (bottom > el.scrollTop + containerHeight.value)
    el.scrollTop = bottom - containerHeight.value;
}

async function selectIndex(index: number): Promise<void> {
  if (index < 0 || index >= rows.value.length) return;
  emit("update:selectedPath", rows.value[index].node.path);
  await nextTick();
  scrollToIndex(index);
}

let typeaheadBuffer = "";
let typeaheadTimer: ReturnType<typeof setTimeout> | null = null;

function onTypeahead(char: string): void {
  typeaheadBuffer += char.toLowerCase();
  if (typeaheadTimer) clearTimeout(typeaheadTimer);
  typeaheadTimer = setTimeout(() => (typeaheadBuffer = ""), TYPEAHEAD_RESET_MS);

  const current = selectedIndex.value;
  const order = [
    ...rows.value.slice(current + 1).map((row, i) => ({ row, index: current + 1 + i })),
    ...rows.value.slice(0, current + 1).map((row, i) => ({ row, index: i })),
  ];
  const match = order.find(({ row }) => row.node.name.toLowerCase().startsWith(typeaheadBuffer));
  if (match) void selectIndex(match.index);
}

function onKeydown(event: KeyboardEvent): void {
  // Uma linha em edição de nome tem seu próprio WInput cuidando do teclado — a
  // navegação da árvore fica pausada até `rename`/`cancel-rename`.
  if (props.editingPath) return;

  const current = selectedIndex.value;

  if (event.key === "F2") {
    event.preventDefault();
    const row = rows.value[current];
    if (row) emit("shortcut", "rename", row.node);
  } else if (event.key.toLowerCase() === "d" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    const row = rows.value[current];
    if (row) emit("shortcut", "duplicate", row.node);
  } else if (event.key === "Delete") {
    event.preventDefault();
    const row = rows.value[current];
    if (row) emit("shortcut", "delete", row.node);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    void selectIndex(current === -1 ? 0 : Math.min(current + 1, rows.value.length - 1));
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    void selectIndex(current === -1 ? rows.value.length - 1 : Math.max(current - 1, 0));
  } else if (event.key === "Home") {
    event.preventDefault();
    void selectIndex(0);
  } else if (event.key === "End") {
    event.preventDefault();
    void selectIndex(rows.value.length - 1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    const row = rows.value[current];
    if (!row) return;
    if (row.node.kind === "folder" && !row.expanded) toggleExpanded(row.node.path);
    else void selectIndex(current + 1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    const row = rows.value[current];
    if (!row) return;
    if (row.node.kind === "folder" && row.expanded) toggleExpanded(row.node.path);
    else if (row.depth > 0) {
      const parentIndex = [...rows.value.entries()]
        .slice(0, current)
        .reverse()
        .find(([, candidate]) => candidate.depth === row.depth - 1)?.[0];
      if (parentIndex !== undefined) void selectIndex(parentIndex);
    }
  } else if (event.key === "Enter") {
    event.preventDefault();
    const row = rows.value[current];
    if (row) activate(row.node);
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    onTypeahead(event.key);
  }
}
</script>

<template>
  <div
    ref="container"
    tabindex="0"
    role="tree"
    class="h-full overflow-y-auto outline-none"
    @scroll="onScroll"
    @keydown="onKeydown"
  >
    <div class="relative" :style="{ height: `${totalHeight}px` }">
      <div class="absolute inset-x-0" :style="{ transform: `translateY(${offsetY}px)` }">
        <div
          v-for="row in visibleRows"
          :key="row.node.path"
          role="treeitem"
          :aria-selected="row.node.path === selectedPath"
          :aria-expanded="row.node.kind === 'folder' ? row.expanded : undefined"
          :style="{ height: `${ROW_HEIGHT}px`, paddingLeft: `${row.depth * 16 + 4}px` }"
          class="flex cursor-pointer items-center gap-1 pr-2 font-inter text-xs"
          :class="
            row.node.path === selectedPath
              ? 'bg-surface-3 text-1'
              : 'text-muted hover:bg-surface-3/50'
          "
          @click="select(row.node.path)"
          @dblclick="activate(row.node)"
          @contextmenu="onRowContextmenu(row.node, $event)"
        >
          <button
            v-if="row.hasChildren"
            type="button"
            tabindex="-1"
            class="flex size-4 shrink-0 items-center justify-center text-faint"
            @click.stop="toggleExpanded(row.node.path)"
          >
            <svg
              class="size-3 transition-transform"
              :class="{ 'rotate-90': row.expanded }"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M7 5l6 5-6 5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <span v-else class="size-4 shrink-0" />

          <WMethodBadge
            v-if="row.node.kind === 'request'"
            :method="row.node.data?.method ?? '?'"
            class="w-10 shrink-0 text-[11px]"
          />

          <WInput
            v-if="row.node.path === editingPath"
            v-model="editingValue"
            class="h-5 flex-1"
            @click.stop
            @keydown.stop.enter="confirmRename"
            @keydown.stop.esc="cancelRename"
            @focusout="confirmRename"
          />
          <span v-else class="truncate">{{ row.node.name }}</span>

          <svg
            v-if="row.node.issues && row.node.issues.length > 0"
            class="ml-auto size-3.5 shrink-0 text-status-5xx"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <title>{{ row.node.issues.map(issue => issue.message).join("; ") }}</title>
            <path
              d="M10 3l8 14H2l8-14z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
            <path
              d="M10 8v4M10 14.5v.01"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WorkspaceNode } from "@shared";

import WIcon from "@renderer/components/WIcon.vue";
import WInput from "@renderer/components/WInput.vue";
import WMethodBadge from "@renderer/components/WMethodBadge.vue";
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";

/** Altura de linha fixa (arch-docs/design-system.md §4) — base da virtualização por janela. */
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

/** Marca curta à direita de uma linha — `class` é um token semântico de cor (ex. `text-status-2xx`). */
export interface TreeDecoration {
  text: string;
  class: string;
  title: string;
}

const props = withDefaults(
  defineProps<{
    nodes: WorkspaceNode[];
    expandedPaths: Set<string>;
    selectedPath: string | null;
    /** Seleção múltipla via Ctrl/Cmd+click (EP-09.1-T03) — `selectedPath` continua o item "ativo" dentro dela. */
    selectedPaths?: Set<string>;
    filterText?: string;
    /** Path do nó em edição inline de nome — `null` quando nada está sendo renomeado. */
    editingPath?: string | null;
    /** Marca curta à direita de cada linha (ex. status Git `M`/`A`, card #51), por `path` do nó. */
    decorations?: Map<string, TreeDecoration>;
    /** Quando presente, só estes paths aparecem (pastas incluídas explicitamente) — com tudo aberto, como no filtro. */
    restrictTo?: Set<string> | null;
  }>(),
  {
    filterText: "",
    editingPath: null,
    selectedPaths: () => new Set(),
    decorations: () => new Map(),
    restrictTo: null,
  },
);

const emit = defineEmits<{
  "update:expandedPaths": [paths: Set<string>];
  "update:selectedPath": [path: string | null];
  "update:selectedPaths": [paths: Set<string>];
  activate: [node: WorkspaceNode, mode: "preview" | "pinned"];
  contextmenu: [node: WorkspaceNode, event: MouseEvent];
  rename: [path: string, name: string];
  "cancel-rename": [];
  shortcut: [type: "rename" | "duplicate" | "delete", node: WorkspaceNode];
  /** Drag & drop soltou `from` dentro de `targetDir`, na posição `index` (1-indexed) — EP-05-T04. */
  move: [from: string, targetDir: string, index: number];
  /** Drag & drop de uma seleção múltipla — todos os `paths` para o fim de `targetDir` (EP-09.1-T03). */
  "move-many": [paths: string[], targetDir: string];
}>();

const parentPathOf = (path: string): string => {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
};

function findContainingArray(nodes: WorkspaceNode[], path: string): WorkspaceNode[] | null {
  for (const node of nodes) {
    if (node.path === path) return nodes;
    if (node.kind === "folder") {
      const found = findContainingArray(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function isDescendantOrSelf(ancestorPath: string, path: string): boolean {
  return path === ancestorPath || path.startsWith(`${ancestorPath}/`);
}

function findNodeByPath(nodes: WorkspaceNode[], path: string): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.kind === "folder") {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

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

const filterActive = computed(
  () => props.filterText.trim().length > 0 || props.restrictTo !== null,
);
const filterLower = computed(() => props.filterText.trim().toLowerCase());

function nodeMatches(node: WorkspaceNode): boolean {
  if (props.restrictTo && !props.restrictTo.has(node.path)) return false;
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

/** Clique fora de qualquer linha limpa a seleção — contexto de criação volta à raiz, como no VS Code. */
function onContainerClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest('[role="treeitem"]')) return;
  emit("update:selectedPath", null);
}

/**
 * Pasta/collection: abre/ativa a aba de settings, igual a uma request (EP-07.1) — só
 * o caret (`toggleExpanded`, abaixo) expande/recolhe a árvore, para o clique na linha
 * poder abrir a aba sem ambiguidade, do jeito que o painel de collection do Postman
 * separa as duas ações. Request: preview no clique simples, fixa no duplo/Enter — sem
 * mudança.
 */
function activate(node: WorkspaceNode, mode: "preview" | "pinned"): void {
  emit("activate", node, mode);
}

/** Ctrl/Cmd+click adiciona/remove `path` da seleção múltipla, semeada com o item ativo atual quando ainda vazia (EP-09.1-T03). */
function toggleMultiSelection(path: string): void {
  const next = new Set(props.selectedPaths);
  if (next.size === 0 && props.selectedPath && props.selectedPath !== path) {
    next.add(props.selectedPath);
  }
  if (next.has(path)) next.delete(path);
  else next.add(path);
  emit("update:selectedPaths", next);
  emit("update:selectedPath", path);
}

function onRowClick(node: WorkspaceNode, event: MouseEvent): void {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    toggleMultiSelection(node.path);
    return;
  }
  if (props.selectedPaths.size > 0) emit("update:selectedPaths", new Set());
  select(node.path);
  activate(node, node.kind === "request" ? "preview" : "pinned");
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

interface DropIndicator {
  index: number;
  mode: "before" | "after" | "into";
  invalid: boolean;
}

const draggingNode = ref<WorkspaceNode | null>(null);
const dropIndicator = ref<DropIndicator | null>(null);
let dragCandidate: { node: WorkspaceNode; startX: number; startY: number } | null = null;
/** Um pointerup que terminou um drag de verdade também dispara `click` no mesmo alvo (mousedown+mouseup no mesmo elemento) — sem isso, soltar um reorder abriria a aba da pasta largada. */
let suppressNextClick = false;

const DRAG_START_THRESHOLD_PX = 4;

function onRowPointerDown(node: WorkspaceNode, event: PointerEvent): void {
  if (props.editingPath || event.button !== 0) return;
  dragCandidate = { node, startX: event.clientX, startY: event.clientY };
  window.addEventListener("pointermove", onDragPointerMove);
  window.addEventListener("pointerup", onDragPointerUp);
}

function computeDropIndicator(event: PointerEvent): DropIndicator | null {
  const el = containerRef.value;
  if (!el || !draggingNode.value) return null;

  const rect = el.getBoundingClientRect();
  const relY = event.clientY - rect.top + scrollTop.value;
  const index = Math.max(0, Math.min(rows.value.length - 1, Math.floor(relY / ROW_HEIGHT)));
  const row = rows.value[index];
  if (!row) return null;

  const fraction = (relY - index * ROW_HEIGHT) / ROW_HEIGHT;
  const isFolder = row.node.kind === "folder";
  const mode: DropIndicator["mode"] =
    fraction < 0.25 ? "before" : fraction > 0.75 || !isFolder ? "after" : "into";

  const dragged = draggingNode.value;
  let invalid = row.node.path === dragged.path;
  if (dragged.kind === "folder") {
    const targetDir = mode === "into" ? row.node.path : parentPathOf(row.node.path);
    invalid = invalid || isDescendantOrSelf(dragged.path, targetDir);
  }

  return { index, mode, invalid };
}

function onDragPointerMove(event: PointerEvent): void {
  if (!draggingNode.value && dragCandidate) {
    const dx = event.clientX - dragCandidate.startX;
    const dy = event.clientY - dragCandidate.startY;
    if (Math.hypot(dx, dy) >= DRAG_START_THRESHOLD_PX) draggingNode.value = dragCandidate.node;
  }
  if (draggingNode.value) dropIndicator.value = computeDropIndicator(event);
}

function endDrag(): void {
  window.removeEventListener("pointermove", onDragPointerMove);
  window.removeEventListener("pointerup", onDragPointerUp);
  dragCandidate = null;
  draggingNode.value = null;
  dropIndicator.value = null;
}

onBeforeUnmount(endDrag);

function isValidMoveTarget(path: string, kind: WorkspaceNode["kind"], targetDir: string): boolean {
  if (path === targetDir) return false;
  if (kind === "folder" && isDescendantOrSelf(path, targetDir)) return false;
  return true;
}

/**
 * Soltar fora da área da árvore não move nada: avisa quem estiver ouvindo (o canvas de um
 * flow cria um nó com a request solta nele). Evento do `window` para a árvore não conhecer o canvas.
 */
function isOutsideTree(event: PointerEvent): boolean {
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) return false;
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

function onDragPointerUp(event: PointerEvent): void {
  const dragged = draggingNode.value;
  if (dragged) suppressNextClick = true;
  if (dragged && isOutsideTree(event)) {
    if (dragged.kind === "request") {
      window.dispatchEvent(
        new CustomEvent("wttp:tree-drop", {
          detail: { path: dragged.path, x: event.clientX, y: event.clientY },
        }),
      );
    }
    endDrag();
    return;
  }
  const indicator = dropIndicator.value;
  if (!dragged || !indicator || indicator.invalid) {
    endDrag();
    return;
  }

  const targetRow = rows.value[indicator.index];
  if (!targetRow) {
    endDrag();
    return;
  }

  const targetDir =
    indicator.mode === "into" ? targetRow.node.path : parentPathOf(targetRow.node.path);

  // Item arrastado faz parte de uma seleção múltipla: move o grupo inteiro, sempre para
  // o fim do destino — do contrário, preserva 100% o comportamento de item único de
  // sempre (posição exata `before`/`after`/`into`, EP-05-T04).
  if (props.selectedPaths.has(dragged.path) && props.selectedPaths.size > 1) {
    const validPaths = [...props.selectedPaths].filter(path => {
      const node = findNodeByPath(props.nodes, path);
      return node ? isValidMoveTarget(path, node.kind, targetDir) : false;
    });
    if (validPaths.length > 0) emit("move-many", validPaths, targetDir);
    endDrag();
    return;
  }

  if (indicator.mode === "into") {
    const siblings = targetRow.node.kind === "folder" ? targetRow.node.children : [];
    emit("move", dragged.path, targetDir, siblings.length + 1);
  } else {
    const siblings = findContainingArray(props.nodes, targetRow.node.path) ?? [];
    const targetIndex = siblings.indexOf(targetRow.node);
    const position = indicator.mode === "before" ? targetIndex + 1 : targetIndex + 2;
    emit("move", dragged.path, targetDir, position);
  }

  endDrag();
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
    if (row) activate(row.node, "pinned");
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
    @click="onContainerClick"
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
          class="relative flex cursor-pointer select-none items-center gap-1 pr-2 font-inter text-xs"
          :class="[
            row.node.path === selectedPath || selectedPaths.has(row.node.path)
              ? 'bg-surface-3 text-1'
              : 'text-muted hover:bg-surface-3/50',
            draggingNode?.path === row.node.path
              ? 'cursor-grabbing opacity-40 outline-dashed outline-1 -outline-offset-1 outline-accent'
              : '',
            dropIndicator?.mode === 'into' &&
            !dropIndicator.invalid &&
            rows[dropIndicator.index]?.node.path === row.node.path
              ? 'bg-accent/20'
              : '',
          ]"
          @click="onRowClick(row.node, $event)"
          @dblclick="activate(row.node, 'pinned')"
          @contextmenu="onRowContextmenu(row.node, $event)"
          @pointerdown="onRowPointerDown(row.node, $event)"
        >
          <div
            v-if="
              dropIndicator &&
              !dropIndicator.invalid &&
              dropIndicator.mode !== 'into' &&
              rows[dropIndicator.index]?.node.path === row.node.path
            "
            class="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-accent"
            :class="dropIndicator.mode === 'before' ? '-top-px' : '-bottom-px'"
          />
          <button
            v-if="row.hasChildren"
            type="button"
            tabindex="-1"
            class="flex size-4 shrink-0 items-center justify-center text-faint"
            @pointerdown.stop
            @click.stop="toggleExpanded(row.node.path)"
          >
            <WIcon
              name="chevron-right"
              size="3"
              class="transition-transform"
              :class="{ 'rotate-90': row.expanded }"
            />
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
            @pointerdown.stop
            @keydown.stop.enter="confirmRename"
            @keydown.stop.esc="cancelRename"
            @focusout="confirmRename"
          />
          <span v-else class="truncate">{{ row.node.name }}</span>

          <WIcon
            v-if="row.node.issues && row.node.issues.length > 0"
            name="triangle-alert"
            size="3.5"
            class="ml-auto text-status-5xx"
            :title="row.node.issues.map(issue => issue.message).join('; ')"
          />
          <span
            v-if="decorations.get(row.node.path)"
            class="shrink-0 font-mono text-[11px] font-semibold"
            :class="[
              decorations.get(row.node.path)!.class,
              row.node.issues && row.node.issues.length > 0 ? '' : 'ml-auto',
            ]"
            :title="decorations.get(row.node.path)!.title"
            data-testid="tree-decoration"
          >
            {{ decorations.get(row.node.path)!.text }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

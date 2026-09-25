<script setup lang="ts">
import { defaultExpanded, flattenTree, type Json, type TreeRow } from "@renderer/lib/jsonTree";
import { computed, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";

import WIcon from "./WIcon.vue";

/**
 * Árvore de um body JSON (ClickLocal #47). Virtualizada por linhas de altura fixa e
 * paginada por container (`flattenTree`), então um JSON de vários MB só monta as ~30
 * linhas que cabem na tela. Não conhece variável nem script — só emite o nó clicado.
 */
const ROW_HEIGHT = 24;
const OVERSCAN = 8;

const props = defineProps<{ data: Json }>();
const emit = defineEmits<{ "node-menu": [row: TreeRow, event: MouseEvent] }>();

const { t } = useI18n();
const expanded = ref(defaultExpanded());
const shown = ref(new Map<string, number>());
const scroller = useTemplateRef<HTMLElement>("scroller");
const scrollTop = ref(0);
const viewportHeight = ref(400);

const rows = computed(() => flattenTree(props.data, expanded.value, shown.value));
const window_ = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    rows.value.length,
    Math.ceil((scrollTop.value + viewportHeight.value) / ROW_HEIGHT) + OVERSCAN,
  );
  return { start, items: rows.value.slice(start, end) };
});

function onScroll(): void {
  scrollTop.value = scroller.value?.scrollTop ?? 0;
  viewportHeight.value = scroller.value?.clientHeight ?? viewportHeight.value;
}

function toggle(row: TreeRow): void {
  if (row.more) {
    const parentId = row.id.slice(0, -"#more".length);
    const next = new Map(shown.value);
    next.set(parentId, (next.get(parentId) ?? 100) + 200);
    shown.value = next;
    return;
  }
  if (!row.expandable) return;
  const next = new Set(expanded.value);
  if (next.has(row.id)) next.delete(row.id);
  else next.add(row.id);
  expanded.value = next;
}

const VALUE_CLASS: Record<string, string> = {
  string: "text-status-2xx",
  number: "text-accent",
  boolean: "text-status-3xx",
  null: "text-faint",
};

function displayValue(row: TreeRow): string {
  if (row.kind === "string") return JSON.stringify(row.value);
  return String(row.value);
}
</script>

<template>
  <div
    ref="scroller"
    class="size-full overflow-auto font-mono text-[13px]"
    data-testid="json-tree"
    @scroll.passive="onScroll"
  >
    <div :style="{ height: `${rows.length * ROW_HEIGHT}px`, position: 'relative' }">
      <div :style="{ transform: `translateY(${window_.start * ROW_HEIGHT}px)` }">
        <div
          v-for="row in window_.items"
          :key="row.id"
          role="treeitem"
          :aria-expanded="row.expandable ? row.expanded : undefined"
          class="flex cursor-default items-center gap-1 whitespace-nowrap pr-3 hover:bg-surface-3"
          :style="{ height: `${ROW_HEIGHT}px`, paddingLeft: `${row.depth * 16 + 4}px` }"
          data-testid="json-tree-row"
          @click="toggle(row)"
          @contextmenu.prevent="!row.more && emit('node-menu', row, $event)"
        >
          <template v-if="row.more">
            <span class="w-4 shrink-0" />
            <span class="font-inter text-xs text-accent">
              {{ t("response.tree.showMore", { count: row.more.remaining }) }}
            </span>
          </template>
          <template v-else>
            <span class="flex w-4 shrink-0 justify-center text-faint">
              <WIcon
                v-if="row.expandable"
                :name="row.expanded ? 'chevron-down' : 'chevron-right'"
                size="3"
              />
            </span>
            <span v-if="row.label !== null" class="text-1"
              >{{ row.label }}<span class="text-faint">:</span></span
            >
            <span v-if="row.summary" class="text-faint">{{ row.summary }}</span>
            <span v-else class="truncate" :class="VALUE_CLASS[row.kind]">{{
              displayValue(row)
            }}</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

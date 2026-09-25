<script setup lang="ts">
import { useCodegenStore } from "@renderer/stores/codegen";
import { isRequestTab, useRequestTabsStore } from "@renderer/stores/requestTabs";
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

import WContextMenu, { type ContextMenuItem } from "./WContextMenu.vue";
import WIcon from "./WIcon.vue";
import WMethodBadge from "./WMethodBadge.vue";

const tabs = useRequestTabsStore();
const codegen = useCodegenStore();
const { t } = useI18n();

const DRAG_START_THRESHOLD_PX = 4;

let dragCandidate: { id: string; startX: number } | null = null;
const draggingId = ref<string | null>(null);

const tabContextMenu = ref<{ id: string; x: number; y: number } | null>(null);

// Espaço da scrollbar só quando ela existe (card #61): com as abas cabendo, a barra tem a
// altura exata das abas; transbordando, ganha os 6px da scrollbar embaixo — as abas em si
// continuam com 32px nos dois casos (card #36).
const barRef = useTemplateRef<HTMLElement>("bar");
const overflowing = ref(false);

function measureOverflow(): void {
  const el = barRef.value;
  overflowing.value = el ? el.scrollWidth > el.clientWidth + 1 : false;
}

let resizeObserver: ResizeObserver | null = null;
watch(
  barRef,
  el => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (!el) return;
    resizeObserver = new ResizeObserver(measureOverflow);
    resizeObserver.observe(el);
    measureOverflow();
  },
  { immediate: true },
);
watch(
  () => tabs.tabs.length,
  async () => {
    await nextTick();
    measureOverflow();
  },
);
onBeforeUnmount(() => resizeObserver?.disconnect());

function onContextMenu(id: string, event: MouseEvent): void {
  event.preventDefault();
  tabContextMenu.value = { id, x: event.clientX, y: event.clientY };
}

const tabContextMenuItems = computed<ContextMenuItem[]>(() => {
  const target = tabContextMenu.value;
  if (!target) return [];
  const items: ContextMenuItem[] = [
    { label: t("tabs.close"), icon: "x", action: () => tabs.requestClose(target.id) },
    { label: t("tabs.closeOthers"), icon: "x", action: () => tabs.closeOthers(target.id) },
    { label: t("tabs.closeAll"), icon: "x", action: () => tabs.closeAll() },
  ];
  const tab = tabs.tabs.find(candidate => candidate.id === target.id);
  if (isRequestTab(tab)) {
    items.push(
      {
        label: t("codegen.copyAsCurl"),
        icon: "terminal",
        separatorBefore: true,
        action: () => void tabs.copyAsCurl(tab.path),
      },
      {
        label: t("codegen.copyAsCurlWithSecrets"),
        icon: "shield-alert",
        action: () => void tabs.copyAsCurl(tab.path, true),
      },
      {
        label: t("codegen.generate"),
        icon: "code",
        action: () => codegen.open(tab.path),
      },
    );
  }
  return items;
});

function onPointerDown(id: string, event: PointerEvent): void {
  if (event.button !== 0) return;
  dragCandidate = { id, startX: event.clientX };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

function onPointerMove(event: PointerEvent): void {
  if (!dragCandidate) return;
  if (
    !draggingId.value &&
    Math.abs(event.clientX - dragCandidate.startX) >= DRAG_START_THRESHOLD_PX
  ) {
    draggingId.value = dragCandidate.id;
  }
  if (!draggingId.value) return;

  const tabElements = [...document.querySelectorAll<HTMLElement>("[data-request-tab]")];
  const hoverIndex = tabElements.findIndex(el => {
    const rect = el.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2;
  });
  const targetIndex = hoverIndex === -1 ? tabElements.length - 1 : hoverIndex;
  if (draggingId.value) tabs.reorder(draggingId.value, targetIndex);
}

function onPointerUp(): void {
  dragCandidate = null;
  draggingId.value = null;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
}

function onClose(id: string, event: MouseEvent): void {
  event.stopPropagation();
  tabs.requestClose(id);
}

function onDoubleClick(id: string): void {
  tabs.pin(id);
}
</script>

<template>
  <div
    ref="bar"
    role="tablist"
    class="tab-scroll flex items-start overflow-x-auto overflow-y-hidden border-b border-subtle"
    :class="overflowing ? 'h-[38px]' : 'h-8'"
  >
    <div
      v-for="tab in tabs.tabs"
      :key="tab.id"
      data-request-tab
      role="tab"
      :aria-selected="tab.id === tabs.activeId"
      class="flex h-8 w-44 shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-subtle px-3 font-inter text-xs"
      :class="[
        tab.id === tabs.activeId ? 'bg-surface-3 text-1' : 'text-muted hover:bg-surface-3/50',
        draggingId === tab.id
          ? 'cursor-grabbing opacity-50 outline-dashed outline-1 -outline-offset-1 outline-accent'
          : '',
      ]"
      @click="tabs.activate(tab.id)"
      @dblclick="onDoubleClick(tab.id)"
      @pointerdown="onPointerDown(tab.id, $event)"
      @contextmenu="onContextMenu(tab.id, $event)"
    >
      <span v-if="tab.dirty" class="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <WMethodBadge
        v-if="tab.kind === 'request'"
        :method="tab.method"
        class="w-8 shrink-0 text-[10px]"
      />
      <WIcon
        v-else
        :name="
          tab.kind === 'environment'
            ? 'sliders-horizontal'
            : tab.kind === 'runner'
              ? 'list-checks'
              : tab.kind === 'changes'
                ? 'git-compare'
                : 'folder'
        "
        size="3.5"
        class="shrink-0 text-faint"
      />
      <span
        class="min-w-0 flex-1 truncate"
        :class="{
          italic: !tab.pinned,
          'text-faint line-through': 'deletedOnDisk' in tab && tab.deletedOnDisk,
        }"
        :title="
          'deletedOnDisk' in tab && tab.deletedOnDisk ? t('branches.deletedOnBranch') : undefined
        "
        >{{ tab.title }}</span
      >
      <button
        type="button"
        :aria-label="t('tabs.closeTab')"
        class="flex size-4 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-2 hover:text-1"
        @click="onClose(tab.id, $event)"
      >
        <WIcon name="x" size="3" />
      </button>
    </div>
  </div>
  <WContextMenu
    :open="tabContextMenu !== null"
    :x="tabContextMenu?.x ?? 0"
    :y="tabContextMenu?.y ?? 0"
    :items="tabContextMenuItems"
    @close="tabContextMenu = null"
  />
</template>

<style scoped>
/* `::-webkit-scrollbar` não tem equivalente em utilitário Tailwind puro (sem plugin) —
   escopado só a esta barra de abas em vez de estilo global. Quando as abas transbordam, o
   container passa de `h-8` para `h-[38px]`: os 6px extras são o espaço da scrollbar, para
   que ela nunca encolha a altura visível das abas (32px). */
.tab-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--w-border-strong)) transparent;
}

.tab-scroll::-webkit-scrollbar {
  height: 6px;
}

.tab-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.tab-scroll::-webkit-scrollbar-thumb {
  background-color: rgb(var(--w-border-strong));
  border-radius: 3px;
}
</style>

<script setup lang="ts">
import { isRequestTab, useRequestTabsStore } from "@renderer/stores/requestTabs";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import WContextMenu, { type ContextMenuItem } from "./WContextMenu.vue";
import WIcon from "./WIcon.vue";
import WMethodBadge from "./WMethodBadge.vue";

const tabs = useRequestTabsStore();
const { t } = useI18n();

const DRAG_START_THRESHOLD_PX = 4;

let dragCandidate: { id: string; startX: number } | null = null;
const draggingId = ref<string | null>(null);

const tabContextMenu = ref<{ id: string; x: number; y: number } | null>(null);

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
    role="tablist"
    class="tab-scroll flex h-[38px] items-start overflow-x-auto overflow-y-hidden border-b border-subtle"
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
   escopado só a esta barra de abas em vez de estilo global. Os 6px extras no `h-[38px]`
   do container (contra `h-8`/32px de cada aba) reservam o espaço da scrollbar nativa
   sempre, para que aparecer/sumir o scroll não mude a altura visível das abas. */
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

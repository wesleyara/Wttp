<script setup lang="ts">
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { ref } from "vue";

import WIcon from "./WIcon.vue";

const tabs = useRequestTabsStore();

const DRAG_START_THRESHOLD_PX = 4;

let dragCandidate: { id: string; startX: number } | null = null;
const draggingId = ref<string | null>(null);

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
</script>

<template>
  <div role="tablist" class="flex h-8 items-stretch overflow-x-auto border-b border-subtle">
    <div
      v-for="tab in tabs.tabs"
      :key="tab.id"
      data-request-tab
      role="tab"
      :aria-selected="tab.id === tabs.activeId"
      class="flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-subtle px-3 font-inter text-xs"
      :class="[
        tab.id === tabs.activeId ? 'bg-surface-3 text-1' : 'text-muted hover:bg-surface-3/50',
        draggingId === tab.id ? 'opacity-50' : '',
      ]"
      @click="tabs.activate(tab.id)"
      @pointerdown="onPointerDown(tab.id, $event)"
    >
      <span v-if="tab.dirty" class="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <span class="max-w-40 truncate" :class="{ italic: !tab.pinned }">{{ tab.title }}</span>
      <button
        type="button"
        aria-label="Close tab"
        class="flex size-4 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-2 hover:text-1"
        @click="onClose(tab.id, $event)"
      >
        <WIcon name="x" size="3" />
      </button>
    </div>
  </div>
</template>

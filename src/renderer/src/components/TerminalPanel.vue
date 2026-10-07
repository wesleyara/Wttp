<script setup lang="ts">
import TerminalView from "@renderer/components/TerminalView.vue";
import WIcon from "@renderer/components/WIcon.vue";
import { useTerminalStore } from "@renderer/stores/terminal";
import { useTerminalPanelStore } from "@renderer/stores/terminalPanel";
import { onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";

/** Painel inferior com as abas de terminal (ClickLocal #169). As views ficam montadas mesmo com o painel fechado. */
const { t } = useI18n();
const panel = useTerminalPanelStore();
const external = useTerminalStore();

const dragging = ref(false);
let startY = 0;
let startHeight = 0;

function onMove(event: MouseEvent): void {
  const maxHeight = Math.round(window.innerHeight * 0.7);
  panel.setHeight(Math.min(maxHeight, startHeight + (startY - event.clientY)));
}

function stopDrag(): void {
  dragging.value = false;
  window.removeEventListener("mousemove", onMove);
  window.removeEventListener("mouseup", stopDrag);
}

function startDrag(event: MouseEvent): void {
  dragging.value = true;
  startY = event.clientY;
  startHeight = panel.height;
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", stopDrag);
}

onBeforeUnmount(stopDrag);
</script>

<template>
  <section
    v-show="panel.open"
    class="relative flex shrink-0 flex-col border-t border-subtle bg-surface-2"
    :style="{ height: `${panel.height}px` }"
    data-testid="terminal-panel"
  >
    <div
      class="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
      :class="dragging ? 'bg-accent/30' : 'hover:bg-accent/20'"
      role="separator"
      aria-orientation="horizontal"
      @mousedown.prevent="startDrag"
    ></div>

    <div class="flex h-8 shrink-0 items-center gap-1 border-b border-subtle px-2">
      <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist">
        <div
          v-for="tab in panel.tabs"
          :key="tab.id"
          class="flex shrink-0 items-center rounded-md font-inter text-xs"
          :class="tab.id === panel.activeId ? 'bg-surface-3 text-1' : 'text-muted hover:text-1'"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="tab.id === panel.activeId"
            class="flex items-center gap-1 py-1 pl-2 pr-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
            @click="panel.activeId = tab.id"
          >
            <WIcon name="terminal" size="3" />
            {{ tab.title }}
            <span v-if="tab.exitCode !== null" class="text-faint">
              {{ t("terminal.exited", { code: tab.exitCode }) }}
            </span>
          </button>
          <button
            type="button"
            class="rounded p-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
            :title="t('terminal.closeTab')"
            :aria-label="t('terminal.closeTab')"
            @click="panel.closeTab(tab.id)"
          >
            <WIcon name="x" size="3" />
          </button>
        </div>
      </div>
      <button
        type="button"
        class="rounded p-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
        :title="t('terminal.newTab')"
        :aria-label="t('terminal.newTab')"
        data-testid="terminal-new-tab"
        @click="panel.newTab()"
      >
        <WIcon name="plus" />
      </button>
      <button
        type="button"
        class="rounded p-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
        :title="t('terminal.openSystem')"
        :aria-label="t('terminal.openSystem')"
        @click="external.open()"
      >
        <WIcon name="external-link" />
      </button>
      <button
        type="button"
        class="rounded p-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
        :title="t('terminal.hide')"
        :aria-label="t('terminal.hide')"
        @click="panel.open = false"
      >
        <WIcon name="chevron-down" />
      </button>
    </div>

    <div class="min-h-0 flex-1">
      <TerminalView
        v-for="tab in panel.tabs"
        v-show="tab.id === panel.activeId"
        :id="tab.id"
        :key="tab.id"
        :visible="panel.open && tab.id === panel.activeId"
      />
    </div>
  </section>
</template>

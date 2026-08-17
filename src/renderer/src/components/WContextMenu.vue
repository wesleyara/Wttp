<script setup lang="ts">
import { nextTick, onBeforeUnmount, useTemplateRef, watch } from "vue";

export interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  /** Separador visual antes deste item — agrupa ações relacionadas (ex: excluir sozinho no fim). */
  separatorBefore?: boolean;
}

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const menuRef = useTemplateRef<HTMLElement>("menu");

function run(item: ContextMenuItem): void {
  item.action();
  emit("close");
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!menuRef.value?.contains(event.target as Node)) emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  }
}

watch(
  () => props.open,
  async isOpen => {
    if (!isOpen) return;
    await nextTick();
    menuRef.value?.focus();
    document.addEventListener("pointerdown", onDocumentPointerDown);
  },
);

onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocumentPointerDown));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menu"
      role="menu"
      tabindex="-1"
      class="fixed z-50 flex min-w-40 flex-col gap-0.5 rounded-md border border-subtle bg-surface-2 p-1 shadow-lg focus-visible:outline-none"
      :style="{ left: `${x}px`, top: `${y}px` }"
      @keydown="onKeydown"
    >
      <template v-for="(item, index) in items" :key="item.label">
        <div v-if="item.separatorBefore && index > 0" class="my-1 h-px bg-surface-3" />
        <button
          type="button"
          role="menuitem"
          class="rounded px-2 py-1.5 text-left font-inter text-sm hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          :class="item.danger ? 'text-status-5xx' : 'text-1'"
          @click="run(item)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>

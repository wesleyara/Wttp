<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";

import WIcon from "./WIcon.vue";

export interface EnvironmentPickerItem {
  path: string;
  label: string;
  variableCount: number;
  /** Heurística de "produção" (nome contém "prod") — sinalizada com selo, não só cor (EP-06-T04). */
  production: boolean;
}

const props = defineProps<{
  open: boolean;
  /** Posição horizontal (px, a partir da esquerda) do canto do popover. */
  x: number;
  /** Distância (px) do rodapé da viewport até o topo do elemento que abre o popover — ancora para cima, já que o trigger fica na status bar no rodapé do app. */
  bottom: number;
  items: EnvironmentPickerItem[];
  activePath: string;
}>();

const emit = defineEmits<{
  close: [];
  select: [path: string];
}>();

const menuRef = useTemplateRef<HTMLElement>("menu");
const focusedIndex = ref(0);

const allItems = computed<EnvironmentPickerItem[]>(() => [
  { path: "", label: "No environment", variableCount: 0, production: false },
  ...props.items,
]);

function select(item: EnvironmentPickerItem): void {
  emit("select", item.path);
  emit("close");
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!menuRef.value?.contains(event.target as Node)) emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusedIndex.value = (focusedIndex.value + 1) % allItems.value.length;
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    focusedIndex.value = (focusedIndex.value - 1 + allItems.value.length) % allItems.value.length;
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const item = allItems.value[focusedIndex.value];
    if (item) select(item);
  }
}

watch(
  () => props.open,
  async isOpen => {
    if (!isOpen) return;
    focusedIndex.value = Math.max(
      0,
      allItems.value.findIndex(item => item.path === props.activePath),
    );
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
      role="listbox"
      tabindex="-1"
      aria-label="Active environment"
      class="fixed z-50 flex max-h-80 w-64 flex-col gap-0.5 overflow-y-auto rounded-md border border-subtle bg-surface-2 p-1 shadow-lg focus-visible:outline-none"
      :style="{ left: `${x}px`, bottom: `${bottom}px` }"
      @keydown="onKeydown"
    >
      <button
        v-for="(item, index) in allItems"
        :key="item.path"
        type="button"
        role="option"
        :aria-selected="item.path === activePath"
        class="flex items-center gap-2 rounded px-2 py-1.5 text-left font-inter text-sm focus-visible:outline-none"
        :class="[
          index === focusedIndex ? 'bg-surface-3' : 'hover:bg-surface-3',
          item.production ? 'font-semibold text-status-5xx' : 'text-1',
        ]"
        @mouseenter="focusedIndex = index"
        @click="select(item)"
      >
        <span
          v-if="item.path === activePath"
          class="size-1.5 shrink-0 rounded-full bg-accent"
          aria-hidden="true"
        />
        <span v-else class="size-1.5 shrink-0" aria-hidden="true" />
        <span class="flex-1 truncate">{{ item.label }}</span>
        <span
          v-if="item.production"
          class="shrink-0 rounded-sm bg-status-5xx/15 px-1 py-0.5 font-inter text-[10px] font-semibold tracking-wide text-status-5xx"
        >
          PROD
        </span>
        <span v-if="item.path" class="shrink-0 font-inter text-[11px] text-faint">
          {{ item.variableCount }}
        </span>
        <WIcon v-if="item.path === activePath" name="check" size="3.5" class="shrink-0" />
      </button>
    </div>
  </Teleport>
</template>

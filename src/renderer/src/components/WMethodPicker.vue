<script setup lang="ts">
import { HTTP_METHODS, methodToken } from "@renderer/lib/http-tokens";
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";

import WIcon from "./WIcon.vue";

/**
 * Popover do seletor de método (EP-08.1-T08) — mesmo padrão de `WEnvironmentPicker.vue`
 * (`Teleport`, `role="listbox"`, setas/Enter/Esc, hover move o foco, clique fora
 * fecha), ancorado **para baixo** (`y`, não `bottom`): o trigger vive na barra de URL,
 * no topo do painel de request, ao contrário do seletor de environment na status bar.
 */
const props = defineProps<{
  open: boolean;
  /** Posição horizontal (px, a partir da esquerda) do canto do popover. */
  x: number;
  /** Distância (px) do topo da viewport até a base do trigger — ancora para baixo. */
  y: number;
  activeMethod: string;
}>();

const emit = defineEmits<{
  close: [];
  select: [method: string];
}>();

const menuRef = useTemplateRef<HTMLElement>("menu");
const focusedIndex = ref(0);

const methods = computed(() => HTTP_METHODS);

function select(method: string): void {
  emit("select", method);
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
    focusedIndex.value = (focusedIndex.value + 1) % methods.value.length;
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    focusedIndex.value = (focusedIndex.value - 1 + methods.value.length) % methods.value.length;
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const method = methods.value[focusedIndex.value];
    if (method) select(method);
  }
}

watch(
  () => props.open,
  async isOpen => {
    if (!isOpen) return;
    focusedIndex.value = Math.max(
      0,
      methods.value.findIndex(method => method === props.activeMethod),
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
      aria-label="HTTP method"
      class="fixed z-50 flex w-32 flex-col gap-0.5 overflow-y-auto rounded-md border border-subtle bg-surface-2 p-1 shadow-lg focus-visible:outline-none"
      :style="{ left: `${x}px`, top: `${y}px` }"
      @keydown="onKeydown"
    >
      <button
        v-for="(method, index) in methods"
        :key="method"
        type="button"
        role="option"
        :aria-selected="method === activeMethod"
        class="flex items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-xs font-medium"
        :class="[
          index === focusedIndex ? 'bg-surface-3' : 'hover:bg-surface-3',
          methodToken(method),
        ]"
        @mouseenter="focusedIndex = index"
        @click="select(method)"
      >
        <span class="flex-1">{{ method }}</span>
        <WIcon v-if="method === activeMethod" name="check" size="3.5" class="shrink-0" />
      </button>
    </div>
  </Teleport>
</template>

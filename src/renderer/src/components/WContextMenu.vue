<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";

import WIcon from "./WIcon.vue";

export interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  /** Separador visual antes deste item — agrupa ações relacionadas (ex: excluir sozinho no fim). */
  separatorBefore?: boolean;
  /** Nome do ícone (`WIcon`) exibido antes do label. */
  icon?: string;
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

const VIEWPORT_MARGIN = 8;
/** Posição efetiva: o clique pode ser perto da borda, e um menu que sai da tela some pela metade. */
const position = ref({ left: 0, top: 0, maxHeight: 0 });

/** Mantém o menu inteiro na viewport: recua da borda direita e, sem espaço embaixo, abre para cima do ponto do clique (ou rola, se nenhum lado couber). */
function fitToViewport(): void {
  const el = menuRef.value;
  if (!el) return;
  const { offsetWidth: width, offsetHeight: height } = el;
  const maxWidthLeft = window.innerWidth - VIEWPORT_MARGIN;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(props.x, maxWidthLeft - width));

  const below = window.innerHeight - props.y - VIEWPORT_MARGIN;
  const above = props.y - VIEWPORT_MARGIN;
  let top = props.y;
  let maxHeight = below;
  if (height > below) {
    if (above > below) {
      maxHeight = above;
      top = Math.max(VIEWPORT_MARGIN, props.y - Math.min(height, above));
    }
  }
  position.value = { left, top, maxHeight: Math.max(maxHeight, 120) };
}

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
  () => [props.open, props.x, props.y],
  async () => {
    if (!props.open) return;
    position.value = { left: props.x, top: props.y, maxHeight: window.innerHeight };
    await nextTick();
    fitToViewport();
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
      class="fixed z-50 flex min-w-40 flex-col gap-0.5 overflow-y-auto rounded-md border border-subtle bg-surface-2 p-1 shadow-lg focus-visible:outline-none"
      :style="{
        left: `${position.left}px`,
        top: `${position.top}px`,
        maxHeight: `${position.maxHeight}px`,
      }"
      @keydown="onKeydown"
    >
      <template v-for="(item, index) in items" :key="item.label">
        <div v-if="item.separatorBefore && index > 0" class="my-1 h-px bg-surface-3" />
        <button
          type="button"
          role="menuitem"
          class="flex items-center gap-2 rounded px-2 py-1.5 text-left font-inter text-sm hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
          :class="item.danger ? 'text-status-5xx' : 'text-1'"
          @click="run(item)"
        >
          <WIcon v-if="item.icon" :name="item.icon" size="3.5" />
          {{ item.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>

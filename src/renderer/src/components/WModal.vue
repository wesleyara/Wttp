<script setup lang="ts">
import { nextTick, onBeforeUnmount, useTemplateRef, watch } from "vue";

import WIcon from "./WIcon.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    /** `lg` para editores com mais conteúdo (ex. environments, EP-06-T03) — `fullscreen` para telas que precisam do espaço quase todo da janela — `md` continua o padrão de diálogos simples. */
    size?: "md" | "lg" | "fullscreen";
  }>(),
  { size: "md" },
);

const emit = defineEmits<{
  close: [];
}>();

const panelRef = useTemplateRef<HTMLElement>("panel");
let previouslyFocused: HTMLElement | null = null;

function close(): void {
  emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

// Foca o painel ao abrir e devolve o foco a quem o abriu ao fechar — um modal nunca
// deixa o teclado "preso" atrás do overlay nem solto de volta no `body`.
watch(
  () => props.open,
  async isOpen => {
    if (isOpen) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      await nextTick();
      panelRef.value?.focus();
    } else {
      previouslyFocused?.focus();
    }
  },
);

onBeforeUnmount(() => previouslyFocused?.focus());
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-surface-1/70 p-4"
      @mousedown.self="close"
    >
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        class="flex w-full flex-col gap-4 rounded-md border border-subtle bg-surface-2 p-4 shadow-lg focus-visible:outline-none"
        :class="[
          size === 'fullscreen' ? 'max-h-[95vh] max-w-[95vw]' : 'max-h-[80vh]',
          size === 'lg' ? 'max-w-3xl' : size === 'md' ? 'max-w-md' : '',
        ]"
        @keydown="onKeydown"
      >
        <div class="flex shrink-0 items-center justify-between gap-4">
          <p class="font-barlow text-base font-semibold text-1">{{ title }}</p>
          <button
            v-if="size !== 'md'"
            type="button"
            title="Close"
            class="rounded text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            @click="close"
          >
            <WIcon name="x" size="4" />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <slot />
        </div>
        <div v-if="$slots.footer" class="flex justify-end gap-2">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

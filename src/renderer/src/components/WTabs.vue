<script setup lang="ts">
import { useI18n } from "vue-i18n";

import WIcon from "./WIcon.vue";

const { t } = useI18n();

const props = defineProps<{
  modelValue: string;
  tabs: {
    value: string;
    label: string;
    count?: number;
    /** Rótulo curto (EP-07-T04) — ex. o tipo efetivo de auth ("Bearer", "Inherited") sem abrir a aba. Mutuamente exclusivo com `count` na mesma tab. */
    badge?: string;
    /** Ícone de alerta ao lado do rótulo — ex. `{{var}}` de auth não resolvida antes do envio (EP-07-T04). */
    warning?: boolean;
  }[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function select(value: string): void {
  emit("update:modelValue", value);
}

function onKeydown(event: KeyboardEvent): void {
  const index = props.tabs.findIndex(tab => tab.value === props.modelValue);
  if (index === -1) return;

  if (event.key === "ArrowRight") {
    event.preventDefault();
    select(props.tabs[(index + 1) % props.tabs.length].value);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    select(props.tabs[(index - 1 + props.tabs.length) % props.tabs.length].value);
  }
}
</script>

<template>
  <div
    role="tablist"
    class="flex h-[38px] items-start gap-1 border-b border-subtle"
    @keydown="onKeydown"
  >
    <div
      class="tab-scroll flex h-[38px] flex-1 items-start gap-1 overflow-x-auto overflow-y-hidden"
    >
      <button
        v-for="tab in tabs"
        :key="tab.value"
        role="tab"
        type="button"
        :aria-selected="tab.value === modelValue"
        :tabindex="tab.value === modelValue ? 0 : -1"
        class="relative flex h-8 shrink-0 items-center whitespace-nowrap rounded-t-md px-3 font-inter text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
        :class="
          tab.value === modelValue
            ? 'bg-surface-3 text-1'
            : 'text-muted hover:bg-surface-3/50 hover:text-1'
        "
        @click="select(tab.value)"
      >
        {{ tab.label }}
        <WIcon
          v-if="tab.warning"
          name="alert-triangle"
          size="3"
          class="ml-1 text-status-4xx"
          :aria-label="t('base.unresolvedVariable')"
        />
        <span
          v-if="tab.count"
          class="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-1 px-1 font-mono text-[10px] text-muted"
        >
          {{ tab.count }}
        </span>
        <span
          v-if="tab.badge"
          class="ml-1.5 rounded-full bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-muted"
        >
          {{ tab.badge }}
        </span>
        <span
          v-if="tab.value === modelValue"
          class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
        />
      </button>
    </div>
    <div v-if="$slots.actions" class="flex h-8 shrink-0 items-center gap-1 pl-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
/* Mesma técnica de `RequestTabsBar.vue` (EP-09.1): os 6px extras no `h-[38px]` (contra
   `h-8`/32px de cada aba) reservam o espaço da scrollbar nativa sempre, para que a tab
   bar não encolha quando o scroll horizontal aparece (ex. response lateralizada
   deixando a coluna de request estreita). */
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

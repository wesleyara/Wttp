<script setup lang="ts">
import { computed } from "vue";

import WIcon from "./WIcon.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: { value: string; label: string }[];
    disabled?: boolean;
    /** Classe de texto aplicada ao valor selecionado — ex: cor por método HTTP. */
    valueClass?: (value: string) => string;
  }>(),
  {
    disabled: false,
    valueClass: undefined,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const triggerClass = computed(() => props.valueClass?.(props.modelValue) ?? "font-inter text-1");

function onChange(event: Event): void {
  emit("update:modelValue", (event.target as HTMLSelectElement).value);
}
</script>

<template>
  <div
    class="relative flex h-8 items-center rounded-md border border-subtle bg-surface-2 pl-2 pr-1 transition-colors focus-within:border-strong focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-surface-1"
    :class="{ 'pointer-events-none opacity-50': disabled }"
  >
    <select
      :value="modelValue"
      :disabled="disabled"
      class="w-full appearance-none bg-transparent text-sm outline-none"
      :class="triggerClass"
      @change="onChange"
    >
      <option v-for="option in props.options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <WIcon name="chevron-down" size="4" class="pointer-events-none text-faint" />
  </div>
</template>

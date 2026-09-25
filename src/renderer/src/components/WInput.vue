<script setup lang="ts">
import { computed, useId } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean;
    type?: string;
    /** URLs e outros valores de código usam `font-mono`, não `font-inter`. */
    monospace?: boolean;
  }>(),
  {
    modelValue: "",
    placeholder: undefined,
    disabled: false,
    error: false,
    type: "text",
    monospace: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const inputId = useId();

function onInput(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}

const wrapperClasses = computed(() => [
  "flex h-8 items-center gap-1.5 rounded-md border bg-surface-2 px-2 transition-colors",
  "focus-within:ring-1 focus-within:ring-inset focus-within:ring-focus",
  props.error ? "border-status-5xx" : "border-subtle focus-within:border-strong",
  props.disabled ? "pointer-events-none opacity-50" : "",
]);
</script>

<template>
  <div :class="wrapperClasses">
    <slot name="prefix" />
    <input
      :id="inputId"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :type="type"
      class="w-full min-w-0 bg-transparent text-sm text-1 outline-none placeholder:text-faint"
      :class="monospace ? 'font-mono text-[13px]' : 'font-inter'"
      @input="onInput"
    />
    <slot name="suffix" />
  </div>
</template>

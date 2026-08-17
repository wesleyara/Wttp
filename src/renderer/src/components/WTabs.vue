<script setup lang="ts">
const props = defineProps<{
  modelValue: string;
  tabs: { value: string; label: string }[];
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
    class="flex h-8 items-stretch gap-1 border-b border-subtle"
    @keydown="onKeydown"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      role="tab"
      type="button"
      :aria-selected="tab.value === modelValue"
      :tabindex="tab.value === modelValue ? 0 : -1"
      class="relative flex items-center rounded-t-md px-3 font-inter text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
      :class="
        tab.value === modelValue
          ? 'bg-surface-3 text-1'
          : 'text-muted hover:bg-surface-3/50 hover:text-1'
      "
      @click="select(tab.value)"
    >
      {{ tab.label }}
      <span
        v-if="tab.value === modelValue"
        class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
      />
    </button>
  </div>
</template>

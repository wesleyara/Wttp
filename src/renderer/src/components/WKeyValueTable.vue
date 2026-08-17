<script setup lang="ts">
import { computed } from "vue";

export interface KeyValueRow {
  enabled: boolean;
  name: string;
  value: string;
  description: string;
}

const props = defineProps<{
  modelValue: KeyValueRow[];
}>();

const emit = defineEmits<{
  "update:modelValue": [rows: KeyValueRow[]];
}>();

// Uma linha em branco sempre no fim: digitar nela promove uma linha real.
const rows = computed(() => [...props.modelValue, blankRow()]);

function blankRow(): KeyValueRow {
  return { enabled: true, name: "", value: "", description: "" };
}

function updateRow(index: number, patch: Partial<KeyValueRow>): void {
  const next = [...props.modelValue];
  if (index === props.modelValue.length) {
    next.push({ ...blankRow(), ...patch });
  } else {
    next[index] = { ...next[index], ...patch };
  }
  emit("update:modelValue", next);
}

function removeRow(index: number): void {
  const next = props.modelValue.filter((_, i) => i !== index);
  emit("update:modelValue", next);
}
</script>

<template>
  <div class="flex flex-col">
    <div
      class="flex h-7 items-center gap-2 border-b border-subtle px-2 font-inter text-xs font-medium text-faint"
    >
      <span class="w-5 shrink-0" />
      <span class="w-1/4 shrink-0">Name</span>
      <span class="w-1/4 shrink-0">Value</span>
      <span class="flex-1">Description</span>
      <span class="w-6 shrink-0" />
    </div>
    <div
      v-for="(row, index) in rows"
      :key="index"
      class="flex h-7 items-center gap-2 border-b border-subtle px-2 last:border-b-0"
    >
      <input
        type="checkbox"
        :checked="row.enabled"
        class="size-3.5 shrink-0 accent-accent"
        :aria-label="`Enable row ${index + 1}`"
        @change="updateRow(index, { enabled: ($event.target as HTMLInputElement).checked })"
      />
      <input
        :value="row.name"
        placeholder="Name"
        class="w-1/4 shrink-0 bg-transparent font-mono text-[13px] text-1 outline-none placeholder:text-faint"
        @input="updateRow(index, { name: ($event.target as HTMLInputElement).value })"
      />
      <input
        :value="row.value"
        placeholder="Value"
        class="w-1/4 shrink-0 bg-transparent font-mono text-[13px] text-1 outline-none placeholder:text-faint"
        @input="updateRow(index, { value: ($event.target as HTMLInputElement).value })"
      />
      <input
        :value="row.description"
        placeholder="Description"
        class="flex-1 bg-transparent font-inter text-sm text-1 outline-none placeholder:text-faint"
        @input="updateRow(index, { description: ($event.target as HTMLInputElement).value })"
      />
      <button
        v-if="index < modelValue.length"
        type="button"
        aria-label="Remove row"
        class="flex size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        @click="removeRow(index)"
      >
        <svg class="size-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 5l10 10M15 5L5 15"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <span v-else class="w-6 shrink-0" />
    </div>
  </div>
</template>

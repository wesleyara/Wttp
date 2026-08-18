<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** Nome do ícone no set Lucide (`@iconify-json/lucide`), sem o prefixo — ex. `"plus"`, `"x"`, `"chevron-right"`. */
    name: string;
    size?: "3" | "3.5" | "4" | "5";
  }>(),
  { size: "3.5" },
);

const icon = computed(() => `lucide:${props.name}`);

const sizeClasses: Record<NonNullable<typeof props.size>, string> = {
  "3": "size-3",
  "3.5": "size-3.5",
  "4": "size-4",
  "5": "size-5",
};
</script>

<template>
  <Icon :icon="icon" class="shrink-0" :class="sizeClasses[size]" aria-hidden="true" />
</template>

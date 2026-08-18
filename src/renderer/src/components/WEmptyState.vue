<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
    <div v-if="$slots.icon" class="text-faint">
      <slot name="icon" />
    </div>
    <div class="flex flex-col gap-1">
      <p class="font-barlow text-base font-semibold text-1">{{ title }}</p>
      <p v-if="description" class="font-inter text-sm text-muted">{{ description }}</p>
    </div>
    <div v-if="$slots.action">
      <slot name="action" />
    </div>
  </div>
</template>

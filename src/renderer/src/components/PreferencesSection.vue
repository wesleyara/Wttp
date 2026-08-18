<script setup lang="ts">
/**
 * Cabeçalho + descrição + campo, para cada item de uma seção do `PreferencesModal`
 * (EP-08.1-T05) — no lugar da pilha de `<p>`/`<div>` que a tela tinha antes.
 */
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-col gap-0.5">
      <p class="font-inter text-sm font-medium text-1">{{ title }}</p>
      <p v-if="description" class="font-inter text-xs text-muted">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>

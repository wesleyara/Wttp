<script setup lang="ts">
import { useSettingsStore } from "@renderer/stores/settings";
import { computed } from "vue";

import { MarkdownView } from "./MarkdownEditor";

/**
 * Prévia só de leitura de markdown (EP-12-T02) — o `MarkdownView` do mesmo wrapper do
 * `WMarkdownEditor`: mesmo renderer, tema e regras offline. `{{variáveis}}` saem com o
 * valor do environment ativo.
 */
withDefaults(
  defineProps<{
    text: string;
    variableValues?: Record<string, string>;
  }>(),
  { variableValues: () => ({}) },
);

const settings = useSettingsStore();
const theme = computed(() => settings.resolvedTheme);
</script>

<template>
  <MarkdownView
    :model-value="text"
    :theme="theme"
    :variable-values="variableValues"
    :image-lightbox="false"
    data-testid="markdown-preview"
  />
</template>

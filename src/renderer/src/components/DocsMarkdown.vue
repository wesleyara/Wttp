<script setup lang="ts">
import { useVariablePreview } from "@renderer/composables/useVariablePreview";
import { toRef } from "vue";

import WMarkdownPreview from "./WMarkdownPreview.vue";

/** Um bloco de `docs` do painel de leitura, com `{{variáveis}}` resolvidas no escopo de `path`. */
const props = defineProps<{ text: string; path: string }>();

const { values } = useVariablePreview(toRef(props, "text"), toRef(props, "path"));
</script>

<template>
  <WMarkdownPreview :text="text" :variable-values="values" />
</template>

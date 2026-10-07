<script setup lang="ts">
import { postProcessMarkdownHtml } from "@renderer/lib/markdownPostProcess";
import { MdPreview } from "md-editor-v3";
import { ref, useTemplateRef } from "vue";

import type { MarkdownViewProps } from "../models/markdown-view.models";

import { setupMarkdownEditor } from "../utils/setup";
import MarkdownEditorImageLightbox from "./MarkdownEditorImageLightbox.vue";

// As instâncias locais de mermaid/katex/highlight precisam estar prontas antes do primeiro render.
const ready = ref(false);
void setupMarkdownEditor().then(() => {
  ready.value = true;
});

/** Renderização só-leitura com o mesmo pipeline do editor (mermaid, katex, highlight) — é o que o
 * ClickLocal usa para exibir comentários. */
const props = withDefaults(defineProps<MarkdownViewProps>(), {
  theme: "light",
  language: "en-US",
  imageLightbox: true,
  echarts: false,
  variableValues: () => ({}),
});

function sanitize(html: string): string {
  return postProcessMarkdownHtml(html, props.variableValues);
}

const lightbox = useTemplateRef("lightbox");

function onClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (props.imageLightbox && target.tagName === "IMG" && target.closest(".md-editor-preview")) {
    lightbox.value?.open((target as HTMLImageElement).src);
  }
}
</script>

<template>
  <div class="mde-view" @click="onClick">
    <MdPreview
      v-if="ready"
      :sanitize="sanitize"
      :model-value="props.modelValue"
      :language="props.language"
      :theme="props.theme"
      preview-theme="default"
      :no-img-zoom-in="true"
      :no-echarts="!props.echarts"
      :show-code-row-number="true"
    />
    <MarkdownEditorImageLightbox ref="lightbox" />
  </div>
</template>

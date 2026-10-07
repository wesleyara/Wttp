<script setup lang="ts">
import { Minimize2 } from "@lucide/vue";
import { postProcessMarkdownHtml } from "@renderer/lib/markdownPostProcess";
import { MdPreview } from "md-editor-v3";
import { nextTick, onBeforeUnmount, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

import type {
  MarkdownEditorFullscreenPreviewEmits,
  MarkdownEditorFullscreenPreviewProps,
} from "../models/markdown-editor-fullscreen-preview.models";

const props = withDefaults(defineProps<MarkdownEditorFullscreenPreviewProps>(), {
  variableValues: () => ({}),
});

const { t } = useI18n();

function sanitize(html: string): string {
  return postProcessMarkdownHtml(html, props.variableValues);
}

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<MarkdownEditorFullscreenPreviewEmits>();

const closeButton = useTemplateRef("closeButton");
let previouslyFocused: HTMLElement | null = null;
let previousOverflow = "";

function onKeydown(event: KeyboardEvent): void {
  // Esc já tratado (ex.: pelo lightbox aberto por cima) não fecha a tela cheia.
  if (event.key === "Escape" && !event.defaultPrevented) open.value = false;
}

function onBodyClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.tagName === "IMG" && target.closest(".md-editor-preview")) {
    emit("imageClick", (target as HTMLImageElement).src);
  }
}

function teardown(): void {
  window.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = previousOverflow;
  previouslyFocused?.focus();
  previouslyFocused = null;
}

watch(open, async value => {
  if (value) {
    previouslyFocused = document.activeElement as HTMLElement | null;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeydown);
    await nextTick();
    closeButton.value?.focus();
  } else {
    teardown();
  }
});

onBeforeUnmount(() => {
  if (open.value) teardown();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="mde-root mde-fullscreen"
      :class="{ 'mde-dark': props.theme === 'dark' }"
      role="dialog"
      aria-modal="true"
      :aria-label="t('markdownEditor.preview')"
    >
      <div class="mde-fullscreen-header">
        <span class="mde-label">{{ t("markdownEditor.preview") }}</span>
        <button
          ref="closeButton"
          type="button"
          class="mde-btn"
          :title="t('markdownEditor.exitFullscreen')"
          @click="open = false"
        >
          <Minimize2 class="mde-icon" />
        </button>
      </div>
      <div class="mde-fullscreen-body" @click="onBodyClick">
        <MdPreview
          :sanitize="sanitize"
          :model-value="props.modelValue"
          :language="props.language"
          :theme="props.theme"
          preview-theme="default"
          :no-img-zoom-in="true"
          :no-echarts="!props.echarts"
          :show-code-row-number="true"
          class="mde-fullscreen-content"
        />
      </div>
    </div>
  </Teleport>
</template>

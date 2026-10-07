<script setup lang="ts">
import { X, ZoomIn, ZoomOut } from "@lucide/vue";
import { onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import type { MarkdownEditorImageLightboxExpose } from "../models/markdown-editor-image-lightbox.models";

const { t } = useI18n();

const src = ref<string | null>(null);
const scale = ref(1);
const translate = ref({ x: 0, y: 0 });
const dragging = ref(false);
const dragStart = { x: 0, y: 0 };
const translateStart = { x: 0, y: 0 };

function open(imageSrc: string): void {
  src.value = imageSrc;
  scale.value = 1;
  translate.value = { x: 0, y: 0 };
}

function close(): void {
  src.value = null;
}

function zoomBy(delta: number, center?: { x: number; y: number }): void {
  const next = Math.min(6, Math.max(1, scale.value + delta));
  if (next === scale.value) return;
  if (center && next > 1) {
    const ratio = next / scale.value - 1;
    translate.value = {
      x: translate.value.x - center.x * ratio,
      y: translate.value.y - center.y * ratio,
    };
  }
  scale.value = next;
  if (scale.value === 1) translate.value = { x: 0, y: 0 };
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const center = {
    x: event.clientX - rect.left - rect.width / 2,
    y: event.clientY - rect.top - rect.height / 2,
  };
  zoomBy(event.deltaY > 0 ? -0.4 : 0.4, center);
}

function onDoubleClick(event: MouseEvent): void {
  if (scale.value > 1) {
    scale.value = 1;
    translate.value = { x: 0, y: 0 };
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  zoomBy(1.5, {
    x: event.clientX - rect.left - rect.width / 2,
    y: event.clientY - rect.top - rect.height / 2,
  });
}

function onPointerDown(event: PointerEvent): void {
  if (scale.value <= 1) return;
  dragging.value = true;
  dragStart.x = event.clientX;
  dragStart.y = event.clientY;
  translateStart.x = translate.value.x;
  translateStart.y = translate.value.y;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return;
  translate.value = {
    x: translateStart.x + (event.clientX - dragStart.x),
    y: translateStart.y + (event.clientY - dragStart.y),
  };
}

function onPointerUp(): void {
  dragging.value = false;
}

// Captura + preventDefault: quem estiver por baixo (ex.: o preview em tela cheia) vê o Esc como
// já tratado e não fecha junto.
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  close();
}

watch(src, value => {
  if (value) window.addEventListener("keydown", onKeydown, { capture: true });
  else window.removeEventListener("keydown", onKeydown, { capture: true });
});

onUnmounted(() => window.removeEventListener("keydown", onKeydown, { capture: true }));

defineExpose<MarkdownEditorImageLightboxExpose>({ open, close });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="src"
      class="mde-lightbox"
      role="dialog"
      aria-modal="true"
      :aria-label="t('markdownEditor.imagePreview')"
      @wheel="onWheel"
      @click.self="close"
    >
      <div class="mde-lightbox-actions">
        <button
          type="button"
          class="mde-btn mde-btn--soft"
          :title="t('markdownEditor.zoomOut')"
          @click="zoomBy(-0.6)"
        >
          <ZoomOut class="mde-icon" />
        </button>
        <button
          type="button"
          class="mde-btn mde-btn--soft"
          :title="t('markdownEditor.zoomIn')"
          @click="zoomBy(0.6)"
        >
          <ZoomIn class="mde-icon" />
        </button>
        <button
          type="button"
          class="mde-btn mde-btn--soft"
          :title="t('markdownEditor.close')"
          @click="close"
        >
          <X class="mde-icon" />
        </button>
      </div>

      <img
        :src="src"
        alt=""
        :style="{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
        }"
        draggable="false"
        @dblclick="onDoubleClick"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
      />
    </div>
  </Teleport>
</template>

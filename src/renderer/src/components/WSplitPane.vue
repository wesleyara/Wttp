<script setup lang="ts">
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    /** `horizontal` = painéis lado a lado, divisor vertical. `vertical` = empilhados. */
    direction: "horizontal" | "vertical";
    /** Tamanho do painel controlado (`sizedPane`), em px. */
    modelValue: number;
    min?: number;
    max?: number;
    collapsed?: boolean;
    /** Qual painel tem tamanho fixo — o outro ocupa o espaço restante (`flex-1`). */
    sizedPane?: "first" | "second";
  }>(),
  {
    min: 160,
    max: Infinity,
    collapsed: false,
    sizedPane: "first",
  },
);

const emit = defineEmits<{
  "update:modelValue": [size: number];
  "update:collapsed": [collapsed: boolean];
}>();

const STEP = 16;
const isHorizontal = computed(() => props.direction === "horizontal");
const sizesFirst = computed(() => props.sizedPane === "first");
const dragging = ref(false);

const firstPaneStyle = computed(() => {
  if (!sizesFirst.value) return { flex: "1 1 0%" };
  if (props.collapsed) return { flex: "0 0 0px", overflow: "hidden" };
  return { flex: `0 1 ${clamp(props.modelValue)}px` };
});

const secondPaneStyle = computed(() => {
  if (sizesFirst.value) return { flex: "1 1 0%" };
  if (props.collapsed) return { flex: "0 0 0px", overflow: "hidden" };
  return { flex: `0 1 ${clamp(props.modelValue)}px` };
});

function clamp(size: number): number {
  return Math.min(props.max, Math.max(props.min, size));
}

function onPointerDown(event: PointerEvent): void {
  if (props.collapsed) return;
  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  dragging.value = true;

  const container = target.parentElement as HTMLElement;
  const rect = container.getBoundingClientRect();

  function onMove(moveEvent: PointerEvent): void {
    const size = sizesFirst.value
      ? isHorizontal.value
        ? moveEvent.clientX - rect.left
        : moveEvent.clientY - rect.top
      : isHorizontal.value
        ? rect.right - moveEvent.clientX
        : rect.bottom - moveEvent.clientY;
    emit("update:modelValue", clamp(size));
  }

  function onUp(): void {
    dragging.value = false;
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
  }

  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
}

function onKeydown(event: KeyboardEvent): void {
  // Setas sempre no sentido do eixo; o sinal inverte conforme qual painel o
  // `modelValue` controla, para que "para a direita/baixo" sempre cresça o valor.
  const decreaseKey = isHorizontal.value ? "ArrowLeft" : "ArrowUp";
  const increaseKey = isHorizontal.value ? "ArrowRight" : "ArrowDown";
  const sign = sizesFirst.value ? 1 : -1;

  if (event.key === decreaseKey) {
    event.preventDefault();
    emit("update:modelValue", clamp(props.modelValue - sign * STEP));
  } else if (event.key === increaseKey) {
    event.preventDefault();
    emit("update:modelValue", clamp(props.modelValue + sign * STEP));
  } else if (event.key === "Enter") {
    event.preventDefault();
    emit("update:collapsed", !props.collapsed);
  }
}

function onDoubleClick(): void {
  emit("update:collapsed", !props.collapsed);
}
</script>

<template>
  <div class="flex size-full min-h-0 min-w-0" :class="isHorizontal ? 'flex-row' : 'flex-col'">
    <div class="min-h-0 min-w-0 overflow-hidden" :style="firstPaneStyle">
      <slot name="first" />
    </div>
    <div
      role="separator"
      tabindex="0"
      :aria-orientation="isHorizontal ? 'vertical' : 'horizontal'"
      :aria-valuenow="Math.round(modelValue)"
      class="group relative shrink-0 touch-none select-none focus-visible:outline-none"
      :class="isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'"
      @pointerdown="onPointerDown"
      @keydown="onKeydown"
      @dblclick="onDoubleClick"
    >
      <div
        class="absolute transition-colors group-hover:bg-accent group-focus-visible:bg-accent"
        :class="[
          isHorizontal
            ? 'inset-y-0 left-1/2 w-px -translate-x-1/2'
            : 'inset-x-0 top-1/2 h-px -translate-y-1/2',
          dragging ? 'bg-accent' : 'bg-subtle',
        ]"
      />
    </div>
    <div class="min-h-0 min-w-0 overflow-hidden" :style="secondPaneStyle">
      <slot name="second" />
    </div>
  </div>
</template>

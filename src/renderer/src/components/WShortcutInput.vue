<script setup lang="ts">
import { acceleratorFromEvent, formatAccelerator } from "@renderer/lib/shortcut";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WIcon from "./WIcon.vue";

/**
 * Captura de combinação de tecla (card "Atalhos de teclado customizáveis"). Não decide
 * conflito nem persiste — só emite `capture` com o acelerador no formato do Electron;
 * quem usa (`PreferencesModal`) valida contra as outras ações e chama
 * `settings.setShortcut`/`restoreShortcut`.
 */
const { t } = useI18n();
const props = defineProps<{
  modelValue: string;
  isCustom: boolean;
}>();

const emit = defineEmits<{
  capture: [accelerator: string];
  restore: [];
}>();

const recording = ref(false);

function startRecording(): void {
  recording.value = true;
}

function stopRecording(): void {
  recording.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if (!recording.value) return;
  event.preventDefault();

  if (event.key === "Escape") {
    stopRecording();
    return;
  }

  const accelerator = acceleratorFromEvent(event);
  if (!accelerator) return;

  stopRecording();
  if (accelerator !== props.modelValue) emit("capture", accelerator);
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <button
      type="button"
      class="flex h-8 min-w-32 items-center justify-center gap-1.5 rounded-md border border-subtle bg-surface-3 px-2 font-mono text-xs text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      :class="recording ? 'border-accent text-accent' : 'hover:border-strong'"
      @click="startRecording"
      @keydown="onKeydown"
      @blur="stopRecording"
    >
      <WIcon v-if="recording" name="keyboard" size="3.5" />
      <span>{{ recording ? t("base.pressKeyCombination") : formatAccelerator(modelValue) }}</span>
    </button>
    <WButton v-if="isCustom" size="sm" variant="ghost" @click="emit('restore')">
      {{ t("base.resetShortcut") }}
    </WButton>
  </div>
</template>

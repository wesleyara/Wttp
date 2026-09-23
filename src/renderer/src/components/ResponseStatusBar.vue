<script setup lang="ts">
import { formatBytes, formatDuration } from "@renderer/lib/format";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WIcon from "./WIcon.vue";
import WStatusBadge from "./WStatusBadge.vue";

/**
 * Status/tempo/tamanho + Copy/Save (EP-03-T07/EP-08.1-T04) — extraído de
 * `ResponsePanel` para não duplicar o bloco entre os dois lugares onde ele aparece:
 * dentro da linha das tabs (`WTabs` `#actions`, cabe quando o painel tem largura à
 * vontade) ou numa linha própria acima delas (só quando a resposta está lateralizada,
 * onde a mesma linha das tabs não tem espaço para as duas coisas sem criar scroll).
 */
defineProps<{
  status: number;
  timingTotal: number;
  timingTitle: string;
  bodySize: number;
  isShowingHistoryFallback: boolean;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  copy: [];
  save: [];
}>();
</script>

<template>
  <span class="flex items-center gap-3">
    <WStatusBadge :code="status" />
    <span class="font-mono text-[13px] text-muted" :title="timingTitle">
      {{ formatDuration(timingTotal) }}
    </span>
    <span class="font-mono text-[13px] text-muted">
      {{ formatBytes(bodySize) }}
    </span>
  </span>
  <span class="text-faint" aria-hidden="true">·</span>
  <span class="flex items-center gap-1">
    <WButton
      size="sm"
      variant="ghost"
      :title="t('response.copyBody')"
      :aria-label="t('response.copyBody')"
      @click="emit('copy')"
    >
      <WIcon name="copy" />
    </WButton>
    <WButton
      v-if="!isShowingHistoryFallback"
      size="sm"
      variant="ghost"
      :title="t('response.saveToFile')"
      :aria-label="t('response.saveToFile')"
      @click="emit('save')"
    >
      <WIcon name="save" />
    </WButton>
  </span>
</template>

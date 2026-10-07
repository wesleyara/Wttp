<script setup lang="ts">
import { formatBytes } from "@renderer/lib/format";
import { attachmentUrl } from "@renderer/lib/markdownAttachments";
import { useAttachmentsStore } from "@renderer/stores/attachments";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WIcon from "./WIcon.vue";
import WModal from "./WModal.vue";

/**
 * Limpeza de anexos não usados (EP-12): lista o que está em `attachments/` e nenhum `docs`
 * cita mais, tudo marcado de início, e manda o marcado para a lixeira do SO. Nunca roda
 * sozinho — o aviso ao salvar só abre este diálogo.
 */

const { t } = useI18n();
const attachments = useAttachmentsStore();
const { cleanupOpen, scanning, trashing, unused, selected } = storeToRefs(attachments);

const allSelected = computed(
  () => unused.value.length > 0 && selected.value.size === unused.value.length,
);
const selectedBytes = computed(() =>
  unused.value
    .filter(info => selected.value.has(info.path))
    .reduce((sum, info) => sum + info.bytes, 0),
);

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
</script>

<template>
  <WModal
    :open="cleanupOpen"
    size="lg"
    :title="t('attachments.cleanup.title')"
    @close="attachments.closeCleanup"
  >
    <div class="flex flex-col gap-3" data-testid="unused-attachments">
      <p class="font-inter text-xs text-muted">{{ t("attachments.cleanup.description") }}</p>

      <p v-if="scanning" class="p-2 font-inter text-xs text-faint">
        {{ t("attachments.cleanup.scanning") }}
      </p>
      <p v-else-if="unused.length === 0" class="p-2 font-inter text-sm text-muted">
        {{ t("attachments.cleanup.empty") }}
      </p>

      <template v-else>
        <label class="flex items-center gap-2 font-inter text-xs text-muted">
          <input
            type="checkbox"
            :checked="allSelected"
            @change="attachments.setAllSelected(($event.target as HTMLInputElement).checked)"
          />
          {{ t("attachments.cleanup.selectAll") }}
        </label>

        <ul class="flex flex-col gap-1">
          <li v-for="info in unused" :key="info.path">
            <label
              class="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-surface-3"
            >
              <input
                type="checkbox"
                :checked="selected.has(info.path)"
                :aria-label="fileName(info.path)"
                @change="attachments.toggle(info.path)"
              />
              <span
                class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border border-subtle bg-surface-3"
              >
                <img
                  v-if="info.kind === 'image'"
                  :src="attachmentUrl(info.path)"
                  alt=""
                  class="size-full object-cover"
                />
                <WIcon v-else name="video" size="4" class="text-faint" />
              </span>
              <span class="min-w-0 flex-1 truncate font-mono text-xs text-1" :title="info.path">
                {{ fileName(info.path) }}
              </span>
              <span class="shrink-0 font-inter text-xs text-muted">{{
                formatBytes(info.bytes)
              }}</span>
            </label>
          </li>
        </ul>
      </template>
    </div>

    <template #footer>
      <span v-if="unused.length > 0" class="mr-auto self-center font-inter text-xs text-muted">
        {{
          t("attachments.cleanup.selectedSummary", {
            count: selected.size,
            size: formatBytes(selectedBytes),
          })
        }}
      </span>
      <WButton variant="ghost" @click="attachments.closeCleanup">
        {{ t("attachments.cleanup.close") }}
      </WButton>
      <WButton
        variant="primary"
        :disabled="selected.size === 0 || trashing"
        @click="attachments.trashSelected"
      >
        <WIcon name="trash-2" />
        {{ t("attachments.cleanup.confirm") }}
      </WButton>
    </template>
  </WModal>
</template>

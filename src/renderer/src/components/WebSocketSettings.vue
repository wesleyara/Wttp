<script setup lang="ts">
import { useRequestStore } from "@renderer/stores/request";
import { reconnectSettings } from "@renderer/stores/websocket";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import WInput from "./WInput.vue";

const { t } = useI18n();
const { websocket } = storeToRefs(useRequestStore());

const subprotocols = computed<string>({
  get: () => (websocket.value.subprotocols ?? []).join(", "),
  set: value => {
    websocket.value = {
      ...websocket.value,
      subprotocols: value.split(",").map(item => item.trim()),
    };
  },
});

const reconnect = computed(() => reconnectSettings(websocket.value));

function patchReconnect(patch: Partial<ReturnType<typeof reconnectSettings>>): void {
  websocket.value = { ...websocket.value, reconnect: { ...reconnect.value, ...patch } };
}

function toCount(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
</script>

<template>
  <div class="flex max-w-xl flex-col gap-4 pt-3" data-testid="websocket-settings">
    <label class="flex flex-col gap-1">
      <span class="font-inter text-xs font-medium text-muted">
        {{ t("websocket.settings.subprotocols") }}
      </span>
      <WInput
        v-model="subprotocols"
        monospace
        :placeholder="t('websocket.settings.subprotocolsPlaceholder')"
      />
      <span class="font-inter text-xs text-faint">{{
        t("websocket.settings.subprotocolsHint")
      }}</span>
    </label>

    <div class="flex flex-col gap-2">
      <label class="flex items-center gap-2 font-inter text-sm text-1">
        <input
          type="checkbox"
          class="size-3.5 accent-accent"
          data-testid="websocket-reconnect-enabled"
          :checked="reconnect.enabled"
          @change="patchReconnect({ enabled: ($event.target as HTMLInputElement).checked })"
        />
        {{ t("websocket.settings.reconnect") }}
      </label>
      <span class="font-inter text-xs text-faint">{{ t("websocket.settings.reconnectHint") }}</span>

      <div class="grid grid-cols-2 gap-3" :class="{ 'opacity-50': !reconnect.enabled }">
        <label class="flex flex-col gap-1">
          <span class="font-inter text-xs font-medium text-muted">
            {{ t("websocket.settings.maxAttempts") }}
          </span>
          <WInput
            :model-value="String(reconnect.maxAttempts)"
            :disabled="!reconnect.enabled"
            type="number"
            @update:model-value="patchReconnect({ maxAttempts: toCount($event, 5) })"
          />
          <span class="font-inter text-xs text-faint">
            {{ t("websocket.settings.maxAttemptsHint") }}
          </span>
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-inter text-xs font-medium text-muted">
            {{ t("websocket.settings.delay") }}
          </span>
          <WInput
            :model-value="String(reconnect.delayMs)"
            :disabled="!reconnect.enabled"
            type="number"
            @update:model-value="patchReconnect({ delayMs: toCount($event, 1000) })"
          />
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUrlQuerySync } from "@renderer/composables/useUrlQuerySync";
import { useVariablePreview } from "@renderer/composables/useVariablePreview";
import { methodToken } from "@renderer/lib/http-tokens";
import { useRequestStore } from "@renderer/stores/request";
import { useVariablesStore } from "@renderer/stores/variables";
import { useWebSocketStore } from "@renderer/stores/websocket";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WCodeEditor from "./WCodeEditor.vue";
import WIcon from "./WIcon.vue";

const { t } = useI18n();
const store = useRequestStore();
const { url, pathParams, query, path } = storeToRefs(store);
const tabId = computed(() => store.tabId);
const ws = useWebSocketStore();
const variablesStore = useVariablesStore();

const { unresolved: urlUnresolved, tooltips: urlTooltips } = useVariablePreview(url, path);
const variableNames = computed(() => variablesStore.variableNamesFor(path.value));

useUrlQuerySync(url, query, pathParams);

const session = computed(() => ws.sessionFor(tabId.value));
/** Conectado, conectando ou aguardando reconexão: o botão vira Disconnect. */
const live = computed(() => session.value.state !== "closed");
const stateLabel = computed(() =>
  t(`websocket.state.${session.value.state}`, { attempt: session.value.attempt }),
);
const stateClass = computed(() => {
  switch (session.value.state) {
    case "open":
      return "bg-status-2xx";
    case "closed":
      return "bg-faint";
    default:
      return "bg-status-4xx";
  }
});

function onToggle(): void {
  if (live.value) void ws.disconnect(tabId.value);
  else void ws.connect(tabId.value);
}
</script>

<template>
  <div class="flex h-8 items-stretch gap-2" data-testid="websocket-url-bar">
    <span
      class="flex h-8 w-14 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface-2 px-2 font-mono text-sm font-medium"
      :class="methodToken('WS')"
    >
      {{ t("websocket.badge") }}
    </span>

    <div class="min-w-0 flex-1">
      <WCodeEditor
        v-model="url"
        data-testid="request-url-editor"
        single-line
        :debounce-ms="0"
        :placeholder="t('websocket.urlPlaceholder')"
        :unresolved-variables="urlUnresolved"
        :variable-tooltips="urlTooltips"
        :variable-names="variableNames"
        @enter="onToggle"
      />
    </div>

    <span
      class="flex shrink-0 items-center gap-1.5 font-inter text-xs text-muted"
      data-testid="websocket-state"
    >
      <span class="size-2 rounded-full" :class="stateClass" aria-hidden="true" />
      {{ stateLabel }}
    </span>

    <WButton
      :variant="live ? 'secondary' : 'primary'"
      data-testid="websocket-toggle"
      @click="onToggle"
    >
      <WIcon :name="live ? 'unplug' : 'plug'" size="3.5" />
      {{ live ? t("websocket.disconnect") : t("websocket.connect") }}
    </WButton>
  </div>
</template>

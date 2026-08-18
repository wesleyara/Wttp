<script setup lang="ts">
import { useUrlQuerySync } from "@renderer/composables/useUrlQuerySync";
import { useVariablePreview } from "@renderer/composables/useVariablePreview";
import { HTTP_METHODS, methodToken } from "@renderer/lib/http-tokens";
import { useRequestStore } from "@renderer/stores/request";
import { useVariablesStore } from "@renderer/stores/variables";
import { storeToRefs } from "pinia";
import { computed } from "vue";

import WButton from "./WButton.vue";
import WCodeEditor from "./WCodeEditor.vue";
import WSelect from "./WSelect.vue";

const store = useRequestStore();
const { method, url, pathParams, query, sending, path } = storeToRefs(store);
const variablesStore = useVariablesStore();

// Realce/tooltip/autocomplete de `{{var}}` na URL (EP-06.1) — mesmo motor do body,
// via `WCodeEditor` de linha única, no lugar de borda+tooltip agregados.
const { unresolved: urlUnresolved, tooltips: urlTooltips } = useVariablePreview(url, path);
const variableNames = computed(() => variablesStore.variableNamesFor(path.value));

// Path param sem valor destaca em vermelho, igual `{{var}}` não resolvida (EP-06.1).
const emptyPathParams = computed(() =>
  pathParams.value.filter(param => param.value === "").map(param => param.name),
);

const methodOptions = HTTP_METHODS.map(value => ({ value, label: value }));

// Sincronização URL ↔ tabela de query params, e URL → tabela de path params (useUrlQuerySync.ts).
useUrlQuerySync(url, query, pathParams);

function onSend(): void {
  if (sending.value) {
    store.cancel();
  } else {
    void store.send();
  }
}

// Detecção só do lado do cliente ("parece um cURL?") — o parsing de verdade
// (`window.wttp.import.parseCurl`) fica no main (EP-08-T05); aqui é só decidir se
// intercepta o paste ou deixa o `WCodeEditor` tratar como texto de URL normal.
const CURL_PREFIX = /^\s*curl(\.exe)?\s/i;

function onPasteUrl(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData("text/plain") ?? "";
  if (!CURL_PREFIX.test(text)) return;

  event.preventDefault();
  event.stopPropagation();
  void store.applyPastedCurl(text);
}
</script>

<template>
  <div class="flex h-8 items-stretch gap-2">
    <div class="w-28 shrink-0">
      <WSelect v-model="method" :options="methodOptions" :value-class="methodToken" />
    </div>
    <div class="flex-1">
      <WCodeEditor
        v-model="url"
        single-line
        highlight-path-params
        :empty-path-params="emptyPathParams"
        :debounce-ms="0"
        placeholder="https://api.example.com/users"
        :unresolved-variables="urlUnresolved"
        :variable-tooltips="urlTooltips"
        :variable-names="variableNames"
        @enter="onSend"
        @paste.capture="onPasteUrl"
      />
    </div>
    <WButton :variant="sending ? 'danger' : 'primary'" class="w-24 shrink-0" @click="onSend">
      {{ sending ? "Cancel" : "Send" }}
    </WButton>
  </div>
</template>

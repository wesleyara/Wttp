<script setup lang="ts">
import { useVariablePreview } from "@renderer/composables/useVariablePreview";
import { HTTP_METHODS, methodToken } from "@renderer/lib/http-tokens";
import { parsePathParamNames, reconcilePathParams } from "@renderer/lib/url-path-params-sync";
import { normalizeEntries, parseQueryFromUrl, rewriteUrlQuery } from "@renderer/lib/url-query-sync";
import { useRequestStore } from "@renderer/stores/request";
import { useVariablesStore } from "@renderer/stores/variables";
import { storeToRefs } from "pinia";
import { computed, watch } from "vue";

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

// Sincronização bidirecional URL ↔ tabela de query params (EP-03-T05). A tabela em si
// mora na aba Params (EP-03-T06) — aqui só a lógica, que independe de quem a renderiza.
// As duas flags impedem que reescrever um lado dispare o watcher do outro de volta —
// sem elas, cada edição viraria um loop entre os dois `watch`.
let syncingFromUrl = false;
let syncingFromQuery = false;

watch(
  url,
  next => {
    if (syncingFromQuery) return;
    syncingFromUrl = true;
    const parsed = parseQueryFromUrl(next);
    if (JSON.stringify(normalizeEntries(parsed)) !== JSON.stringify(normalizeEntries(query.value)))
      query.value = parsed;
    syncingFromUrl = false;
  },
  { flush: "sync" },
);

// Reconciliação de path params (EP-06.1) — mão única, URL → tabela. Só troca nomes,
// nunca reescreve a URL de volta (o valor de um path param não mora nela).
watch(
  url,
  next => {
    const names = parsePathParamNames(next);
    const reconciled = reconcilePathParams(names, pathParams.value);
    if (JSON.stringify(reconciled) !== JSON.stringify(pathParams.value)) {
      pathParams.value = reconciled;
    }
  },
  { flush: "sync" },
);

watch(
  query,
  rows => {
    if (syncingFromUrl) return;
    syncingFromQuery = true;
    const rewritten = rewriteUrlQuery(url.value, rows);
    if (rewritten !== url.value) url.value = rewritten;
    syncingFromQuery = false;
  },
  { deep: true, flush: "sync" },
);

function onSend(): void {
  if (sending.value) {
    store.cancel();
  } else {
    void store.send();
  }
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
      />
    </div>
    <WButton :variant="sending ? 'danger' : 'primary'" class="w-24 shrink-0" @click="onSend">
      {{ sending ? "Cancel" : "Send" }}
    </WButton>
  </div>
</template>

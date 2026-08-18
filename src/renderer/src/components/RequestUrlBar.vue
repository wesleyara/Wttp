<script setup lang="ts">
import { useVariablePreview } from "@renderer/composables/useVariablePreview";
import { HTTP_METHODS, methodToken } from "@renderer/lib/http-tokens";
import { parseQueryFromUrl, rewriteUrlQuery } from "@renderer/lib/url-query-sync";
import { useRequestStore } from "@renderer/stores/request";
import { storeToRefs } from "pinia";
import { watch } from "vue";

import WButton from "./WButton.vue";
import WInput from "./WInput.vue";
import WSelect from "./WSelect.vue";

const store = useRequestStore();
const { method, url, query, sending, path } = storeToRefs(store);

// Realce/tooltip de `{{var}}` na URL (EP-06-T05) — sem overlay por caractere, a URL
// inteira sinaliza "tem algo não resolvido" (borda) e o tooltip lista origem/valor.
const { unresolved: urlUnresolved, tooltip: urlTooltip } = useVariablePreview(url, path);

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
    query.value = parseQueryFromUrl(next);
    syncingFromUrl = false;
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
      <WInput
        v-model="url"
        placeholder="https://api.example.com/users"
        monospace
        :error="urlUnresolved.length > 0"
        :title="urlTooltip || undefined"
        @keydown.enter="onSend"
      />
    </div>
    <WButton :variant="sending ? 'danger' : 'primary'" class="w-24 shrink-0" @click="onSend">
      {{ sending ? "Cancel" : "Send" }}
    </WButton>
  </div>
</template>

<script setup lang="ts">
import { HTTP_METHODS, methodToken } from "@renderer/lib/http-tokens";
import { parseQueryFromUrl, rewriteUrlQuery } from "@renderer/lib/url-query-sync";
import { useRequestStore } from "@renderer/stores/request";
import { storeToRefs } from "pinia";
import { computed, watch } from "vue";

import type { KeyValueRow } from "./WKeyValueTable.vue";

import WButton from "./WButton.vue";
import WInput from "./WInput.vue";
import WKeyValueTable from "./WKeyValueTable.vue";
import WSelect from "./WSelect.vue";

const store = useRequestStore();
const { method, url, query, sending } = storeToRefs(store);

const methodOptions = HTTP_METHODS.map(value => ({ value, label: value }));

const queryRows = computed<KeyValueRow[]>({
  get: () => query.value.map(row => ({ ...row, description: row.description ?? "" })),
  set: rows => {
    query.value = rows;
  },
});

// Sincronização bidirecional URL ↔ tabela de query params (EP-03-T05). As duas flags
// impedem que reescrever um lado dispare o watcher do outro de volta — sem elas, cada
// edição viraria um loop entre os dois `watch`.
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
  <div class="flex flex-col gap-2">
    <div class="flex h-8 items-stretch gap-2">
      <div class="w-28 shrink-0">
        <WSelect v-model="method" :options="methodOptions" :value-class="methodToken" />
      </div>
      <div class="flex-1">
        <WInput
          v-model="url"
          placeholder="https://api.example.com/users"
          monospace
          @keydown.enter="onSend"
        />
      </div>
      <WButton :variant="sending ? 'danger' : 'primary'" class="w-24 shrink-0" @click="onSend">
        {{ sending ? "Cancel" : "Send" }}
      </WButton>
    </div>
    <WKeyValueTable v-model="queryRows" />
  </div>
</template>

<script setup lang="ts">
import type { HttpMethod } from "@shared";

import { useUrlQuerySync } from "@renderer/composables/useUrlQuerySync";
import { useVariablePreview } from "@renderer/composables/useVariablePreview";
import { methodToken } from "@renderer/lib/http-tokens";
import { useRequestStore } from "@renderer/stores/request";
import { useVariablesStore } from "@renderer/stores/variables";
import { useWatchStore } from "@renderer/stores/watch";
import { storeToRefs } from "pinia";
import { computed, ref, useTemplateRef } from "vue";

import SendControl from "./SendControl.vue";
import WCodeEditor from "./WCodeEditor.vue";
import WIcon from "./WIcon.vue";
import WMethodPicker from "./WMethodPicker.vue";

const store = useRequestStore();
const { method, url, pathParams, query, sending, path } = storeToRefs(store);
const tabId = computed(() => store.tabId);
const watchStore = useWatchStore();
const variablesStore = useVariablesStore();

// Realce/tooltip/autocomplete de `{{var}}` na URL (EP-06.1) — mesmo motor do body,
// via `WCodeEditor` de linha única, no lugar de borda+tooltip agregados.
const { unresolved: urlUnresolved, tooltips: urlTooltips } = useVariablePreview(url, path);
const variableNames = computed(() => variablesStore.variableNamesFor(path.value));

// Path param sem valor destaca em vermelho, igual `{{var}}` não resolvida (EP-06.1).
const emptyPathParams = computed(() =>
  pathParams.value.filter(param => param.value === "").map(param => param.name),
);

// Popover do método (EP-08.1-T08) — mesmo padrão de posicionamento do seletor de
// environment na StatusBar, mas ancorado para baixo (o trigger fica no topo do painel).
const methodTriggerRef = useTemplateRef<HTMLElement>("methodTrigger");
const methodPickerOpen = ref(false);
const methodPickerPosition = ref({ x: 0, y: 0 });

function openMethodPicker(): void {
  const rect = methodTriggerRef.value?.getBoundingClientRect();
  if (!rect) return;
  methodPickerPosition.value = { x: rect.left, y: rect.bottom + 4 };
  methodPickerOpen.value = true;
}

function onMethodChange(next: string): void {
  method.value = next as HttpMethod;
}

// Sincronização URL ↔ tabela de query params, e URL → tabela de path params (useUrlQuerySync.ts).
useUrlQuerySync(url, query, pathParams);

function onSend(): void {
  // Enter na URL bar durante um watch não dispara um envio paralelo à sessão.
  if (watchStore.sessionFor(tabId.value)?.running) return;
  if (sending.value) {
    store.cancel();
  } else {
    void store.send();
  }
}

// Detecção só do lado do cliente ("parece um cURL?") — o parsing de verdade
// (`window.wttp.import.parseCurl`) fica no main (EP-08-T05); aqui é só decidir se
// intercepta o paste ou deixa o `WCodeEditor` tratar como texto de URL normal. Uma vez
// interceptado, nada é colado como texto: cURL que o parser não entende só gera um
// aviso (`applyPastedCurl`, card #45) — metade de um comando na URL bar não ajuda ninguém.
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
    <button
      ref="methodTrigger"
      type="button"
      class="flex h-8 w-28 shrink-0 items-center rounded-md border border-subtle bg-surface-2 pl-2 pr-1 transition-colors hover:border-strong focus-visible:border-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      @click="openMethodPicker"
    >
      <span class="flex-1 text-left font-mono text-sm font-medium" :class="methodToken(method)">
        {{ method }}
      </span>
      <WIcon name="chevron-down" size="4" class="pointer-events-none text-faint" />
    </button>

    <WMethodPicker
      :open="methodPickerOpen"
      :x="methodPickerPosition.x"
      :y="methodPickerPosition.y"
      :active-method="method"
      @close="methodPickerOpen = false"
      @select="onMethodChange"
    />

    <div class="flex-1">
      <WCodeEditor
        v-model="url"
        data-testid="request-url-editor"
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
    <SendControl
      v-if="tabId"
      :tab-id="tabId"
      :sending="sending"
      @send="onSend"
      @cancel="store.cancel"
    />
  </div>
</template>

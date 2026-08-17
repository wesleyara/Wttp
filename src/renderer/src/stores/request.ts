import type {
  AuthConfig,
  HttpMethod,
  HttpResponseResult,
  KeyValueEntry,
  RequestBody,
  SaveFileResult,
} from "@shared";

import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { defineStore } from "pinia";
import { computed } from "vue";

/**
 * Fachada sobre a aba ativa de `useRequestTabsStore` (EP-05-T05) — cada campo é um
 * `computed({get,set})` que lê/escreve o estado da aba selecionada, e toda escrita
 * marca a aba suja (e promove de preview a fixa, se for o caso). Existe só para
 * `RequestConfigTabs`/`RequestUrlBar`/`ResponsePanel` continuarem chamando
 * `useRequestStore()` sem saber que "a" request virou "uma entre N abas" — nenhum dos
 * três precisou mudar uma linha quando as abas chegaram.
 */
export const useRequestStore = defineStore("request", () => {
  const tabs = useRequestTabsStore();

  const method = computed<HttpMethod>({
    get: () => tabs.active?.method ?? "GET",
    set: value => {
      if (!tabs.active) return;
      tabs.active.method = value;
      tabs.markActiveDirty();
    },
  });

  const url = computed<string>({
    get: () => tabs.active?.url ?? "",
    set: value => {
      if (!tabs.active) return;
      tabs.active.url = value;
      tabs.markActiveDirty();
    },
  });

  const query = computed<KeyValueEntry[]>({
    get: () => tabs.active?.query ?? [],
    set: value => {
      if (!tabs.active) return;
      tabs.active.query = value;
      tabs.markActiveDirty();
    },
  });

  const headers = computed<KeyValueEntry[]>({
    get: () => tabs.active?.headers ?? [],
    set: value => {
      if (!tabs.active) return;
      tabs.active.headers = value;
      tabs.markActiveDirty();
    },
  });

  const body = computed<RequestBody>({
    get: () => tabs.active?.body ?? { type: "none" },
    set: value => {
      if (!tabs.active) return;
      tabs.active.body = value;
      tabs.markActiveDirty();
    },
  });

  const auth = computed<AuthConfig>({
    get: () => tabs.active?.auth ?? { type: "none" },
    set: value => {
      if (!tabs.active) return;
      tabs.active.auth = value;
      tabs.markActiveDirty();
    },
  });

  const docs = computed<string>({
    get: () => tabs.active?.docs ?? "",
    set: value => {
      if (!tabs.active) return;
      tabs.active.docs = value;
      tabs.markActiveDirty();
    },
  });

  const sending = computed(() => tabs.active?.sending ?? false);
  const lastResult = computed<HttpResponseResult | null>(() => tabs.active?.lastResult ?? null);

  function send(): Promise<void> {
    return tabs.send();
  }

  function cancel(): void {
    tabs.cancel();
  }

  function saveResponseToFile(): Promise<SaveFileResult | null> {
    return tabs.saveResponseToFile();
  }

  return {
    method,
    url,
    query,
    headers,
    body,
    auth,
    docs,
    sending,
    lastResult,
    send,
    cancel,
    saveResponseToFile,
  };
});

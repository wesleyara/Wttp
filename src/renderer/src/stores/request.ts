import type {
  AuthConfig,
  HttpMethod,
  HttpResponseResult,
  KeyValueEntry,
  RequestBody,
  RequestScripts,
  SaveFileResult,
} from "@shared";

import {
  isRequestTab,
  type ScriptRunSummary,
  useRequestTabsStore,
} from "@renderer/stores/requestTabs";
import { useToastStore } from "@renderer/stores/toast";
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
  const toast = useToastStore();

  // A aba ativa pode agora ser de pasta/collection (EP-07.1) — esta fachada só faz
  // sentido para uma de request; os componentes que a consomem (`RequestConfigTabs`,
  // `RequestUrlBar`, `ResponsePanel`) só montam quando `AppShell` já garantiu isso, mas
  // os getters continuam com fallback seguro mesmo assim.
  const active = computed(() => {
    const tab = tabs.active;
    return isRequestTab(tab) ? tab : null;
  });

  /** Caminho da request ativa, relativo à raiz do workspace — para resolução de variáveis (EP-06-T05), que precisa saber a cadeia de pastas. Só leitura: renomear é feito pela árvore, não aqui. */
  const path = computed<string>(() => active.value?.path ?? "");

  const method = computed<HttpMethod>({
    get: () => active.value?.method ?? "GET",
    set: value => {
      if (!active.value) return;
      active.value.method = value;
      tabs.markActiveDirty();
    },
  });

  const url = computed<string>({
    get: () => active.value?.url ?? "",
    set: value => {
      if (!active.value) return;
      active.value.url = value;
      tabs.markActiveDirty();
    },
  });

  const pathParams = computed<KeyValueEntry[]>({
    get: () => active.value?.pathParams ?? [],
    set: value => {
      if (!active.value) return;
      active.value.pathParams = value;
      tabs.markActiveDirty();
    },
  });

  const query = computed<KeyValueEntry[]>({
    get: () => active.value?.query ?? [],
    set: value => {
      if (!active.value) return;
      active.value.query = value;
      tabs.markActiveDirty();
    },
  });

  const headers = computed<KeyValueEntry[]>({
    get: () => active.value?.headers ?? [],
    set: value => {
      if (!active.value) return;
      active.value.headers = value;
      tabs.markActiveDirty();
    },
  });

  const body = computed<RequestBody>({
    get: () => active.value?.body ?? { type: "none" },
    set: value => {
      if (!active.value) return;
      active.value.body = value;
      tabs.markActiveDirty();
    },
  });

  const auth = computed<AuthConfig>({
    get: () => active.value?.auth ?? { type: "none" },
    set: value => {
      if (!active.value) return;
      active.value.auth = value;
      tabs.markActiveDirty();
    },
  });

  const docs = computed<string>({
    get: () => active.value?.docs ?? "",
    set: value => {
      if (!active.value) return;
      active.value.docs = value;
      tabs.markActiveDirty();
    },
  });

  const scripts = computed<RequestScripts>({
    get: () => active.value?.scripts ?? {},
    set: value => {
      if (!active.value) return;
      active.value.scripts = value;
      tabs.markActiveDirty();
    },
  });

  const sending = computed(() => active.value?.sending ?? false);
  const lastResult = computed<HttpResponseResult | null>(() => active.value?.lastResult ?? null);
  const scriptRun = computed<ScriptRunSummary | null>(() => active.value?.scriptRun ?? null);

  function send(): Promise<void> {
    return tabs.send();
  }

  function cancel(): void {
    tabs.cancel();
  }

  function saveResponseToFile(): Promise<SaveFileResult | null> {
    return tabs.saveResponseToFile();
  }

  /**
   * Colar um cURL na barra de URL preenche a request inteira (EP-08-T05) em vez de
   * só o texto colado. Devolve `false` quando o conteúdo não era mesmo um cURL — quem
   * chama decide deixar o paste padrão acontecer nesse caso.
   */
  async function applyPastedCurl(content: string): Promise<boolean> {
    if (!active.value) return false;

    const parsed = await window.wttp.import.parseCurl({ content });
    if (!parsed) return false;

    active.value.method = parsed.method;
    active.value.url = parsed.url;
    active.value.query = parsed.query;
    active.value.headers = parsed.headers;
    if (parsed.auth) active.value.auth = parsed.auth;
    if (parsed.body) active.value.body = parsed.body;
    tabs.markActiveDirty();

    toast.push(
      parsed.notConverted.length > 0
        ? `cURL importado — ${parsed.notConverted.length} item(ns) não convertido(s)`
        : "cURL importado",
      parsed.notConverted.length > 0 ? "warning" : "success",
    );
    return true;
  }

  return {
    path,
    method,
    url,
    pathParams,
    query,
    headers,
    body,
    auth,
    docs,
    scripts,
    sending,
    lastResult,
    scriptRun,
    send,
    cancel,
    saveResponseToFile,
    applyPastedCurl,
  };
});

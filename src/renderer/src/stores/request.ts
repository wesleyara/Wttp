import type {
  AuthConfig,
  HttpMethod,
  HttpResponseResult,
  KeyValueEntry,
  RequestBody,
  RequestScripts,
  SaveFileResult,
} from "@shared";

import { i18n } from "@renderer/i18n";
import { rewriteUrlQuery } from "@renderer/lib/url-query-sync";
import {
  isRequestTab,
  type RequestTabState,
  type ScriptRunSummary,
  useRequestTabsStore,
} from "@renderer/stores/requestTabs";
import { useToastStore } from "@renderer/stores/toast";
import { useTreeStore } from "@renderer/stores/tree";
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
/** Onde um cURL colado na URL bar foi parar (card #45). */
export type PastedCurlOutcome = "filled" | "newTab" | "invalid";

function hasRows(rows: KeyValueEntry[]): boolean {
  return rows.some(row => row.name.trim() !== "" || row.value.trim() !== "");
}

/**
 * A aba tem algo que colar um cURL por cima apagaria? Olha só os campos que o cURL
 * substitui — URL, params, headers, body e auth. Docs e scripts não contam: o cURL
 * nunca mexe neles. Uma "New request" recém-criada (`url: ""`, sem body, auth `none`)
 * é vazia e pode ser preenchida no lugar.
 */
export function hasRequestContent(
  tab: Pick<RequestTabState, "url" | "pathParams" | "query" | "headers" | "body" | "auth">,
): boolean {
  return (
    tab.url.trim() !== "" ||
    hasRows(tab.pathParams) ||
    hasRows(tab.query) ||
    hasRows(tab.headers) ||
    tab.body.type !== "none" ||
    (tab.auth.type !== "none" && tab.auth.type !== "inherit")
  );
}

function parentDirOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export const useRequestStore = defineStore("request", () => {
  const tabs = useRequestTabsStore();
  const toast = useToastStore();
  const tree = useTreeStore();

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
   * Colar um cURL na barra de URL monta a request inteira (EP-08-T05, card #45), com o
   * mesmo parser do import (`import:parseCurl`). Nunca sobrescreve trabalho: aba vazia
   * é preenchida no lugar; aba com conteúdo (`hasRequestContent`) fica como está e o
   * cURL vai para uma request nova ao lado dela, aberta numa aba própria — como o
   * "New request" da árvore, o arquivo nasce com o conteúdo padrão e o cURL entra como
   * edição não salva. cURL que o parser não entende (sem URL) não cola nada, só avisa.
   */
  async function applyPastedCurl(content: string): Promise<PastedCurlOutcome> {
    const current = active.value;
    if (!current) return "invalid";

    const parsed = await window.wttp.import.parseCurl({ content });
    if (!parsed || parsed.url.trim() === "") {
      toast.push(i18n.global.t("toast.curlPasteInvalid"), "warning");
      return "invalid";
    }

    let outcome: PastedCurlOutcome = "filled";
    if (hasRequestContent(current)) {
      const createdPath = await tree.createRequest(parentDirOf(current.path), {
        rename: false,
        notify: false,
      });
      if (!createdPath) return "invalid";
      await tabs.openPinned(createdPath);
      outcome = "newTab";
    }

    const target = active.value;
    if (!target) return "invalid";
    target.method = parsed.method;
    // URL já com a query string, como a sincronização URL ↔ tabela deixaria — senão a
    // aba nova abriria com params na tabela e uma URL sem eles.
    target.url = rewriteUrlQuery(parsed.url, parsed.query);
    target.query = parsed.query;
    target.headers = parsed.headers;
    if (parsed.auth) target.auth = parsed.auth;
    if (parsed.body) target.body = parsed.body;
    tabs.markActiveDirty();

    const partial = parsed.notConverted.length > 0;
    const key =
      outcome === "newTab"
        ? partial
          ? "toast.curlImportedNewTabPartial"
          : "toast.curlImportedNewTab"
        : partial
          ? "toast.curlImportedPartial"
          : "toast.curlImported";
    toast.push(
      i18n.global.t(key, { count: parsed.notConverted.length }),
      partial ? "warning" : "success",
    );
    return outcome;
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

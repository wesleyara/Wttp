import type { KeyValueEntry } from "@shared";
import type { Ref } from "vue";

import { parsePathParamNames, reconcilePathParams } from "@renderer/lib/url-path-params-sync";
import { normalizeEntries, parseQueryFromUrl, rewriteUrlQuery } from "@renderer/lib/url-query-sync";
import { watch } from "vue";

/**
 * Sincronização bidirecional URL ↔ tabela de query params, e mão-única URL → tabela
 * de path params (EP-03-T05/EP-06.1). `url`/`query`/`pathParams` são a fachada da aba
 * ativa (`useRequestStore`) — trocar de aba também muda `url`, então cada escrita só
 * acontece quando o conteúdo reparseado difere de verdade do que já está na aba,
 * nunca incondicional (senão a troca de aba marcaria a aba nova como suja).
 */
export function useUrlQuerySync(
  url: Ref<string>,
  query: Ref<KeyValueEntry[]>,
  pathParams: Ref<KeyValueEntry[]>,
): void {
  let syncingFromUrl = false;
  let syncingFromQuery = false;

  watch(
    url,
    next => {
      if (syncingFromQuery) return;
      syncingFromUrl = true;
      const parsed = parseQueryFromUrl(next);
      if (
        JSON.stringify(normalizeEntries(parsed)) !== JSON.stringify(normalizeEntries(query.value))
      )
        query.value = parsed;
      syncingFromUrl = false;
    },
    { flush: "sync" },
  );

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
}

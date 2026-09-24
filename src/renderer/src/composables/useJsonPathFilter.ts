import type { ComputedRef, Ref } from "vue";

import { compileJsonPath, JsonPathError } from "@renderer/lib/jsonpath";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, ref, watch } from "vue";

/** Estado do filtro aplicado ao body: sem filtro, resultado, ou por que não deu para filtrar. */
export type JsonPathFilterResult =
  | { kind: "none" }
  | { kind: "ok"; text: string; count: number }
  | { kind: "syntaxError"; message: string; position: number }
  | { kind: "invalidJson" };

/**
 * Filtro JSONPath do painel de resposta (ClickLocal #48). A expressão fica guardada por
 * request em `.wttp/ui-state.json` (`responseFilters`), local e fora do YAML — reabrir a
 * request (ou o app) volta com o último filtro. `enabled` desliga tudo quando o body
 * não é JSON; o texto original nunca é alterado, só o que o painel exibe.
 */
export function useJsonPathFilter(
  requestPath: Ref<string>,
  bodyText: Ref<string>,
  enabled: Ref<boolean>,
): { expression: Ref<string>; result: ComputedRef<JsonPathFilterResult> } {
  const workspace = useWorkspaceStore();
  const expression = ref("");

  function storedFor(path: string): string {
    return workspace.uiState.responseFilters?.[path] ?? "";
  }

  // `uiStateVersion` avança quando o `.wttp/ui-state.json` é lido do disco — sem ele, a
  // request restaurada na abertura do app leria o filtro antes do arquivo chegar.
  watch(
    [requestPath, () => workspace.uiStateVersion],
    ([path]) => {
      expression.value = storedFor(path);
    },
    { immediate: true },
  );

  watch(expression, value => {
    const path = requestPath.value;
    if (!path || value === storedFor(path)) return;
    const filters = { ...workspace.uiState.responseFilters };
    if (value.trim()) filters[path] = value;
    else delete filters[path];
    workspace.patchUiState({ responseFilters: filters });
  });

  const parsedBody = computed<{ ok: true; value: unknown } | { ok: false }>(() => {
    if (!enabled.value) return { ok: false };
    try {
      return { ok: true, value: JSON.parse(bodyText.value) };
    } catch {
      return { ok: false };
    }
  });

  const result = computed<JsonPathFilterResult>(() => {
    const source = expression.value.trim();
    if (!enabled.value || !source) return { kind: "none" };
    let query: (value: unknown) => unknown[];
    try {
      query = compileJsonPath(source);
    } catch (error) {
      if (error instanceof JsonPathError) {
        return { kind: "syntaxError", message: error.message, position: error.position };
      }
      throw error;
    }
    const parsed = parsedBody.value;
    if (!parsed.ok) return { kind: "invalidJson" };
    const matches = query(parsed.value);
    return { kind: "ok", text: JSON.stringify(matches, null, 2), count: matches.length };
  });

  return { expression, result };
}

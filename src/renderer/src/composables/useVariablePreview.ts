import type { ResolvedVariablePayload } from "@shared";
import type { Ref } from "vue";

import { useVariablesStore } from "@renderer/stores/variables";
import { ref, watch } from "vue";

const DEBOUNCE_MS = 200;

/** Uma linha de tooltip por variável usada — origem sempre visível, valor só quando não é segredo (docs/file-format.md §5). */
function describeUsed(variable: ResolvedVariablePayload, isSecret: boolean): string {
  return isSecret
    ? `${variable.name} — ${variable.source} (secret)`
    : `${variable.name} = ${variable.value} (${variable.source})`;
}

/**
 * Prévia de resolução de `{{var}}` para um campo de texto (EP-06-T05) — debounced para
 * não bater o IPC a cada tecla. `secretNames` marca quais variáveis usadas não devem
 * ter o valor exposto no tooltip, mesmo já resolvidas.
 */
export function useVariablePreview(
  text: Ref<string>,
  requestPath: Ref<string>,
  secretNames: Ref<Set<string>> = ref(new Set()),
): {
  unresolved: Ref<string[]>;
  tooltip: Ref<string>;
  tooltips: Ref<Record<string, string>>;
} {
  const variables = useVariablesStore();
  const unresolved = ref<string[]>([]);
  const tooltip = ref("");
  const tooltips = ref<Record<string, string>>({});

  let timer: ReturnType<typeof setTimeout> | undefined;

  async function refresh(): Promise<void> {
    const value = text.value;
    if (!value.includes("{{")) {
      unresolved.value = [];
      tooltip.value = "";
      tooltips.value = {};
      return;
    }

    const result = await variables.resolveText(value, requestPath.value);
    unresolved.value = result.unresolved;

    const perName: Record<string, string> = {};
    for (const used of result.used) {
      perName[used.name] = describeUsed(used, secretNames.value.has(used.name));
    }
    for (const name of result.unresolved) {
      perName[name] = `${name} — not resolved`;
    }
    tooltips.value = perName;
    tooltip.value = Object.values(perName).join("\n");
  }

  watch(
    [text, requestPath],
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), DEBOUNCE_MS);
    },
    { immediate: true },
  );

  return { unresolved, tooltip, tooltips };
}

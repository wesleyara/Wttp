import type { ResolvedVariablePayload } from "@shared";
import type { Ref } from "vue";

import { useVariablesStore } from "@renderer/stores/variables";
import { ref, watch } from "vue";

const DEBOUNCE_MS = 200;

/** Uma linha de tooltip por variável usada — origem sempre visível, valor só quando não é segredo (arch-docs/file-format.md §5). */
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
  /** Valor de cada variável resolvida (segredo mascarado) — alimenta a prévia de markdown (EP-12-T01). */
  values: Ref<Record<string, string>>;
} {
  const variables = useVariablesStore();
  const unresolved = ref<string[]>([]);
  const tooltip = ref("");
  const tooltips = ref<Record<string, string>>({});
  const values = ref<Record<string, string>>({});

  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  async function refresh(): Promise<void> {
    const requestGeneration = ++generation;
    const value = text.value;
    if (!value.includes("{{")) {
      unresolved.value = [];
      tooltip.value = "";
      tooltips.value = {};
      values.value = {};
      return;
    }

    const result = await variables.resolveText(value, requestPath.value);
    // Uma resolução mais recente pode ter começado (e talvez já terminado) enquanto esta
    // estava em voo — ex. troca de aba durante o IPC. Descarta a resposta velha em vez de
    // sobrescrever o estado da aba atual com o resultado de outra request/escopo.
    if (requestGeneration !== generation) return;
    unresolved.value = result.unresolved;

    const perName: Record<string, string> = {};
    const perValue: Record<string, string> = {};
    for (const used of result.used) {
      perName[used.name] = describeUsed(used, secretNames.value.has(used.name));
      perValue[used.name] = secretNames.value.has(used.name) ? "••••" : used.value;
    }
    values.value = perValue;
    for (const name of result.unresolved) {
      perName[name] = `${name} — not resolved`;
    }
    tooltips.value = perName;
    tooltip.value = Object.values(perName).join("\n");
  }

  watch(
    [text, requestPath, () => variables.scopeSignal],
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), DEBOUNCE_MS);
    },
    { immediate: true },
  );

  return { unresolved, tooltip, tooltips, values };
}

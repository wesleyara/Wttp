import type { AuthConfig } from "@shared";
import type { Ref } from "vue";

import { type EffectiveAuthSource, useVariablesStore } from "@renderer/stores/variables";
import { ref, watch } from "vue";

const DEBOUNCE_MS = 200;

/**
 * Auth efetiva de um nó (request ou pasta) depois de subir a herança (EP-07-T01),
 * reativa ao editar `auth` ali mesmo ou em qualquer pasta acima na árvore — mesmo
 * padrão debounced de `useVariablePreview`, usado pela Aba Auth (EP-07-T03) para o
 * modo `inherit` mostrar de onde a auth vem, e pelo indicador (EP-07-T04) para saber
 * o tipo efetivo sem abrir a aba.
 */
export function useEffectiveAuth(
  auth: Ref<AuthConfig>,
  path: Ref<string>,
  selfLabel: Ref<string>,
): {
  effective: Ref<AuthConfig>;
  source: Ref<EffectiveAuthSource>;
  /** `true` quando a auth efetiva não vem do próprio `auth` (veio de uma pasta/collection acima). */
  inherited: Ref<boolean>;
} {
  const variables = useVariablesStore();
  const effective = ref<AuthConfig>({ type: "none" });
  const source = ref<EffectiveAuthSource>({ kind: "none", label: "No auth configured" });
  const inherited = ref(false);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  async function refresh(): Promise<void> {
    const requestGeneration = ++generation;
    if (!path.value) return;

    const result = await variables.resolveEffectiveAuth(path.value, auth.value, selfLabel.value);
    if (requestGeneration !== generation) return;

    effective.value = result.resolution.auth;
    source.value = result.source;
    inherited.value = result.resolution.sourceIndex !== null && result.resolution.sourceIndex > 0;
  }

  watch(
    [auth, path, () => variables.scopeSignal],
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), DEBOUNCE_MS);
    },
    { immediate: true, deep: true },
  );

  return { effective, source, inherited };
}

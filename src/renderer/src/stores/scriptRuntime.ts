import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Variáveis de runtime (EP-09-T02/T03) — nível de maior precedência do resolvedor de
 * `{{variável}}` (EP-06-T01). Definidas por `wttp.setVar` num script, sobrevivem só à
 * sessão do app (nunca gravadas em disco) e ficam disponíveis para a request seguinte
 * — é o que faz "login guarda token, request seguinte autentica sozinha" funcionar.
 */
export const useScriptRuntimeStore = defineStore("scriptRuntime", () => {
  const vars = ref<Record<string, string>>({});

  /** Substitui o snapshot inteiro — usado depois de cada fase de script rodar, já com o que ela definiu. */
  function setAll(next: Record<string, string>): void {
    vars.value = { ...next };
  }

  function reset(): void {
    vars.value = {};
  }

  return { vars, setAll, reset };
});

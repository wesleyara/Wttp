import { defineStore } from "pinia";
import { ref } from "vue";

/** Alvo do modal "Generate code" (ClickLocal #46): a request cujo snippet está sendo gerado. */
export const useCodegenStore = defineStore("codegen", () => {
  const target = ref<{ path: string } | null>(null);

  function open(path: string): void {
    target.value = { path };
  }

  function close(): void {
    target.value = null;
  }

  return { target, open, close };
});

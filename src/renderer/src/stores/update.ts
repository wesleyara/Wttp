import type { UpdateStatus } from "@shared";

import { defineStore } from "pinia";
import { ref } from "vue";

import { useToastStore } from "./toast";

/**
 * Auto-update (EP-11-T03) — `status` espelha o `update:status` do main (checando,
 * disponível, baixando, baixado, erro, ou `.deb` sem suporte), consumido por
 * `PreferencesModal` (seção Updates). Quando o download termina, esta store também
 * decide a única ação de UI que a task pede fora das Preferences: um toast com
 * "Update now"/dispensar — "dispensar" não é um não, é o "depois" da task, o update já
 * instala sozinho no próximo restart (`autoInstallOnAppQuit`, `main/update/updater.ts`).
 */
export const useUpdateStore = defineStore("update", () => {
  const status = ref<UpdateStatus>({ state: "idle" });

  /**
   * Se inscreve antes de ler o status atual — nessa ordem, um status enviado pelo main
   * entre as duas chamadas ainda é capturado pelo listener; a leitura via
   * `getStatus` cobre só o que já tinha sido enviado antes de existir um listener
   * (ex. `unsupported` no boot de um `.deb`, perdido sem isso).
   */
  function listen(): () => void {
    const unsubscribe = window.wttp.update.onStatus(next => {
      status.value = next;
      if (next.state === "downloaded") {
        useToastStore().push(`Wttp ${next.version} is ready to install.`, "info", 0, {
          label: "Update now",
          onClick: () => void window.wttp.update.install(),
        });
      }
    });
    void window.wttp.update.getStatus().then(current => (status.value = current));
    return unsubscribe;
  }

  function check(): Promise<void> {
    return window.wttp.update.check();
  }

  return { status, listen, check };
});

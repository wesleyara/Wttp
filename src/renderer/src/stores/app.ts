import type { AppInfo, WttpError } from "@shared";

import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Store de exemplo do EP-01-T04, provando a cadeia main → preload → renderer de ponta
 * a ponta. O componente nunca chama `window.wttp.*` direto — só a store.
 */
export const useAppStore = defineStore("app", () => {
  const info = ref<AppInfo | null>(null);
  const error = ref<WttpError | null>(null);

  async function ping(): Promise<void> {
    try {
      info.value = await window.wttp.app.ping();
      error.value = null;
    } catch (e) {
      error.value = e as WttpError;
    }
  }

  /** Abre `url` no browser do SO — o main recusa qualquer coisa fora da allowlist (EP-08.1-T05). */
  function openExternal(url: string): void {
    void window.wttp.app.openExternal({ url });
  }

  return { info, error, ping, openExternal };
});

import type { MenuAction } from "@shared";

import { defineStore } from "pinia";
import { ref } from "vue";

const MESSAGE_TIMEOUT_MS = 3000;

/**
 * Ponte entre o menu nativo (EP-02-T06) e o renderer. `handlers` deixa cada épico de
 * produto interceptar uma ação específica (ex: EP-05-T03 usa `request:new` para criar
 * uma request de verdade na árvore); qualquer ação sem handler ainda cai na mensagem
 * transitória de status, prova de que o roundtrip main → IPC → renderer funciona.
 */
export const useMenuStore = defineStore("menu", () => {
  const statusMessage = ref<string | null>(null);
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  function listen(handlers: Partial<Record<MenuAction, () => void>> = {}): () => void {
    return window.wttp.menu.onAction(action => {
      const handler = handlers[action];
      if (handler) {
        handler();
        return;
      }
      statusMessage.value = `Menu: ${action}`;
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => (statusMessage.value = null), MESSAGE_TIMEOUT_MS);
    });
  }

  return { statusMessage, listen };
});

import { defineStore } from "pinia";
import { ref } from "vue";

const MESSAGE_TIMEOUT_MS = 3000;

/**
 * Ponte entre o menu nativo (EP-02-T06) e o renderer. Sem tabs de request ainda
 * (EP-05), então cada ação só aparece como mensagem transitória na `StatusBar` — prova
 * que o roundtrip main → IPC → renderer funciona; os épicos de produto substituem essa
 * mensagem pela ação real (nova aba, salvar, enviar, focar busca).
 */
export const useMenuStore = defineStore("menu", () => {
  const statusMessage = ref<string | null>(null);
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  function listen(): () => void {
    return window.wttp.menu.onAction(action => {
      statusMessage.value = `Menu: ${action}`;
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => (statusMessage.value = null), MESSAGE_TIMEOUT_MS);
    });
  }

  return { statusMessage, listen };
});

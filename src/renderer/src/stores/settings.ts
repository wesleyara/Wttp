import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Store de exemplo do EP-01-T06, provando que Pinia está registrado e é lido por um
 * componente. Vira `useSettingsStore` real, com estado persistido em
 * `.wttp/ui-state.json`, no épico de settings.
 */
export const useSettingsStore = defineStore("settings", () => {
  const appName = ref("Wttp");

  return { appName };
});

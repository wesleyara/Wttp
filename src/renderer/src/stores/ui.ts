import type { UiState } from "@shared";

import { defineStore } from "pinia";
import { ref } from "vue";

const PERSIST_DEBOUNCE_MS = 300;

/**
 * Tamanhos do shell de três painéis, persistidos via IPC (EP-02-T04). Arrastar o
 * `WSplitPane` dispara muitas atualizações por segundo — a escrita em disco é
 * debounced para não martelar o `fs` a cada pixel.
 */
export const useUiStore = defineStore("ui", () => {
  const sidebarWidth = ref(260);
  const responsePanelSize = ref(420);
  const responsePanelPosition = ref<UiState["responsePanelPosition"]>("side");
  const loaded = ref(false);

  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  async function load(): Promise<void> {
    const state = await window.wttp.ui.getState();
    sidebarWidth.value = state.sidebarWidth;
    responsePanelSize.value = state.responsePanelSize;
    responsePanelPosition.value = state.responsePanelPosition;
    loaded.value = true;
  }

  function persist(patch: Partial<UiState>): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void window.wttp.ui.setState(patch);
    }, PERSIST_DEBOUNCE_MS);
  }

  function setSidebarWidth(value: number): void {
    sidebarWidth.value = value;
    persist({ sidebarWidth: value });
  }

  function setResponsePanelSize(value: number): void {
    responsePanelSize.value = value;
    persist({ responsePanelSize: value });
  }

  function toggleResponsePanelPosition(): void {
    responsePanelPosition.value = responsePanelPosition.value === "side" ? "bottom" : "side";
    persist({ responsePanelPosition: responsePanelPosition.value });
  }

  return {
    sidebarWidth,
    responsePanelSize,
    responsePanelPosition,
    loaded,
    load,
    setSidebarWidth,
    setResponsePanelSize,
    toggleResponsePanelPosition,
  };
});

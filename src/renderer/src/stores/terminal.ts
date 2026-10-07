import type { WttpError } from "@shared";

import { useToastStore } from "@renderer/stores/toast";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";

/** "Open terminal" (ClickLocal #35): terminal do sistema na raiz do workspace aberto. */
export const useTerminalStore = defineStore("terminal", () => {
  const workspace = useWorkspaceStore();
  const toast = useToastStore();

  async function open(): Promise<void> {
    if (!workspace.root) return;
    try {
      await window.wttp.terminal.open({ root: workspace.root });
    } catch (caught) {
      toast.push((caught as WttpError).message, "error", 8000);
    }
  }

  return { open };
});

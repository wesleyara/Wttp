import type { WttpError } from "@shared";

import { useGitStore } from "@renderer/stores/git";
import { useToastStore } from "@renderer/stores/toast";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { ref, watch } from "vue";

export interface TerminalTab {
  id: number;
  /** Nome do shell (`zsh`, `bash`…). */
  shell: string;
  title: string;
  exitCode: number | null;
}

const DEFAULT_HEIGHT = 260;
const MIN_HEIGHT = 120;

/**
 * Painel de terminal embutido (ClickLocal #169): abas de shells reais (pty no main) na
 * pasta do workspace. A saída chega por evento e pode vir antes de a aba ter uma view
 * montada — `pending` guarda até o `TerminalView` se registrar. O painel é descartado
 * junto com o workspace: trocar/fechar o workspace mata todas as sessões.
 */
export const useTerminalPanelStore = defineStore("terminalPanel", () => {
  const workspace = useWorkspaceStore();
  const toast = useToastStore();
  const git = useGitStore();

  const open = ref(false);
  const tabs = ref<TerminalTab[]>([]);
  const activeId = ref<number | null>(null);
  const height = ref(DEFAULT_HEIGHT);

  const writers = new Map<number, (data: string) => void>();
  const pending = new Map<number, string[]>();
  let spawning = false;

  /**
   * Um `git commit`/`checkout`/`add` no terminal mexe no repositório sem passar pelo app,
   * e o `.git` não é observado — então a saída do terminal agenda um refresh do status
   * (debounced: roda quando o comando para de escrever). Só o eco do que o usuário acabou
   * de digitar não conta, senão cada tecla dispararia um `git status`.
   */
  const ECHO_WINDOW_MS = 80;
  let lastKeystrokeAt = 0;

  function write(id: number, data: string): void {
    if (!/[\r\n]/.test(data)) lastKeystrokeAt = Date.now();
    void window.wttp.terminal.write({ id, data }).catch(() => undefined);
  }

  function receive(id: number, data: string): void {
    if (Date.now() - lastKeystrokeAt > ECHO_WINDOW_MS) git.scheduleRefresh();
    const writer = writers.get(id);
    if (writer) writer(data);
    else pending.set(id, [...(pending.get(id) ?? []), data]);
  }

  /** Chamado pela view ao montar: recebe o que já chegou e passa a receber o resto direto. */
  function register(id: number, writer: (data: string) => void): () => void {
    writers.set(id, writer);
    for (const chunk of pending.get(id) ?? []) writer(chunk);
    pending.delete(id);
    return () => writers.delete(id);
  }

  async function newTab(): Promise<void> {
    if (!workspace.root || spawning) return;
    spawning = true;
    try {
      const { id, shell } = await window.wttp.terminal.spawn({
        root: workspace.root,
        cols: 80,
        rows: 24,
      });
      // Várias abas do mesmo shell: `zsh`, `zsh (2)`…
      const same = tabs.value.filter(tab => tab.shell === shell).length;
      tabs.value.push({
        id,
        shell,
        title: same === 0 ? shell : `${shell} (${same + 1})`,
        exitCode: null,
      });
      activeId.value = id;
      open.value = true;
    } catch (caught) {
      toast.push((caught as WttpError).message, "error", 8000);
    } finally {
      spawning = false;
    }
  }

  async function toggle(): Promise<void> {
    if (open.value) {
      open.value = false;
      return;
    }
    if (tabs.value.length === 0) await newTab();
    else open.value = true;
  }

  function closeTab(id: number): void {
    void window.wttp.terminal.kill(id).catch(() => undefined);
    writers.delete(id);
    pending.delete(id);
    const index = tabs.value.findIndex(tab => tab.id === id);
    if (index === -1) return;
    tabs.value.splice(index, 1);
    if (activeId.value === id) activeId.value = tabs.value[Math.max(0, index - 1)]?.id ?? null;
    if (tabs.value.length === 0) open.value = false;
  }

  function closeAll(): void {
    for (const tab of [...tabs.value]) closeTab(tab.id);
    open.value = false;
  }

  function setHeight(value: number): void {
    height.value = Math.max(MIN_HEIGHT, Math.round(value));
  }

  /** Liga os eventos do main; devolve o cancelamento. */
  function listen(): () => void {
    const stopData = window.wttp.terminal.onData(event => receive(event.id, event.data));
    const stopExit = window.wttp.terminal.onExit(event => {
      const tab = tabs.value.find(item => item.id === event.id);
      if (tab) tab.exitCode = event.exitCode;
    });
    return () => {
      stopData();
      stopExit();
    };
  }

  watch(
    () => workspace.root,
    () => closeAll(),
  );

  return {
    open,
    tabs,
    activeId,
    height,
    register,
    write,
    newTab,
    toggle,
    closeTab,
    closeAll,
    setHeight,
    listen,
  };
});

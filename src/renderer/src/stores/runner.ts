import type {
  HttpMethod,
  RunEvent,
  RunRequestResult,
  RunSummary,
  WorkspaceNode,
  WttpError,
} from "@shared";

import { useEnvironmentStore } from "@renderer/stores/environment";
import { isRunnerTab, useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

/** Uma linha da lista do runner — marcável e reordenável só para esta execução. */
export interface RunnerItem {
  path: string;
  name: string;
  method: HttpMethod;
  selected: boolean;
}

export type RunnerStatus = "idle" | "running" | "finished" | "failed";

/** Requests sob `targetPath` na ordem da árvore (`seq`, profundidade primeiro) — a mesma de `planFolder` no main. */
export function requestsUnder(nodes: WorkspaceNode[], targetPath: string): RunnerItem[] {
  const out: RunnerItem[] = [];
  const walk = (list: WorkspaceNode[], inside: boolean): void => {
    for (const node of list) {
      if (node.kind === "request") {
        if (inside && node.data) {
          out.push({ path: node.path, name: node.name, method: node.data.method, selected: true });
        }
      } else if (inside || node.path === targetPath || targetPath.startsWith(`${node.path}/`)) {
        walk(node.children, inside || node.path === targetPath);
      }
    }
  };
  walk(nodes, targetPath === "");
  return out;
}

/**
 * Collection Runner na interface (EP-13-T01). O run acontece no main
 * (`runner:start`, `src/main/runner`); esta store só guarda a configuração, a lista
 * marcável/reordenável e o que chega por `runner:event`.
 */
export const useRunnerStore = defineStore("runner", () => {
  const workspace = useWorkspaceStore();
  const environment = useEnvironmentStore();
  const tabs = useRequestTabsStore();

  const targetPath = ref<string | null>(null);
  const targetName = ref("");
  const items = ref<RunnerItem[]>([]);
  const environmentPath = ref<string | null>(null);
  const iterations = ref(1);
  const delayMs = ref(0);
  const bail = ref(false);
  const persistVariables = ref(true);

  const runId = ref<string | null>(null);
  const status = ref<RunnerStatus>("idle");
  const iterationsPlanned = ref(1);
  const planSize = ref(0);
  const results = ref<RunRequestResult[]>([]);
  const current = ref<{ iteration: number; index: number; path: string } | null>(null);
  const summary = ref<RunSummary | null>(null);
  const error = ref<WttpError | null>(null);

  const selectedCount = computed(() => items.value.filter(item => item.selected).length);
  /** Selecionadas com aba suja — o runner lê do disco, então elas rodam na versão salva. */
  const unsavedSelected = computed(() => {
    const dirty = new Set(tabs.tabs.filter(tab => tab.dirty).map(tab => tab.path));
    return items.value.filter(item => item.selected && dirty.has(item.path));
  });
  const totalSteps = computed(() => planSize.value * iterationsPlanned.value);
  const progress = computed(() =>
    totalSteps.value === 0 ? 0 : Math.min(1, results.value.length / totalSteps.value),
  );
  const running = computed(() => status.value === "running");

  /** Aponta o runner para uma pasta/collection (ou `""` = workspace inteiro) e abre a aba. */
  function configure(path: string, name: string): void {
    if (running.value) {
      tabs.openRunnerTab();
      return;
    }
    targetPath.value = path;
    targetName.value = name;
    items.value = requestsUnder(workspace.tree?.children ?? [], path);
    environmentPath.value = environment.activePath;
    resetResults();
    tabs.openRunnerTab();
  }

  function resetResults(): void {
    status.value = "idle";
    results.value = [];
    current.value = null;
    summary.value = null;
    error.value = null;
  }

  function move(from: number, to: number): void {
    if (running.value || from === to || to < 0 || to >= items.value.length) return;
    const [item] = items.value.splice(from, 1);
    items.value.splice(to, 0, item);
  }

  function setAllSelected(selected: boolean): void {
    for (const item of items.value) item.selected = selected;
  }

  async function start(): Promise<void> {
    if (running.value || targetPath.value === null || !workspace.root) return;
    resetResults();
    status.value = "running";
    try {
      const result = await window.wttp.runner.start({
        root: workspace.root,
        targetPath: targetPath.value,
        selection: items.value.filter(item => item.selected).map(item => item.path),
        environmentPath: environmentPath.value,
        iterations: Math.max(1, Math.trunc(iterations.value) || 1),
        delayMs: Math.max(0, Math.trunc(delayMs.value) || 0),
        bail: bail.value,
        persistVariables: persistVariables.value,
      });
      runId.value = result.runId;
    } catch (caught) {
      status.value = "failed";
      error.value = caught as WttpError;
    }
  }

  function stop(): void {
    if (running.value && runId.value) void window.wttp.runner.stop(runId.value);
  }

  function onEvent(event: RunEvent): void {
    if (event.runId !== runId.value) return;
    switch (event.type) {
      case "started":
        planSize.value = event.plan.length;
        iterationsPlanned.value = event.iterations;
        break;
      case "requestStarted":
        current.value = { iteration: event.iteration, index: event.index, path: event.path };
        break;
      case "requestFinished":
        results.value.push(event.result);
        break;
      case "finished":
        current.value = null;
        summary.value = event.summary;
        status.value = "finished";
        // O run pode ter gravado variáveis (`persistVariables`) — a árvore e os
        // environments abertos precisam refletir isso.
        if (persistVariables.value) {
          void workspace.refreshTree();
          void environment.refresh();
        }
        break;
      case "failed":
        current.value = null;
        status.value = "failed";
        error.value = event.error;
        break;
    }
  }

  // Assinatura única durante a vida do app — a store é singleton, não um componente.
  window.wttp.runner.onEvent(onEvent);

  // Fechar a aba do runner no meio de um run para o run: nada mais o mostraria.
  watch(
    () => tabs.tabs.some(isRunnerTab),
    open => {
      if (!open) stop();
    },
  );

  // Workspace trocado ou fechado: a configuração aponta para paths que não existem mais.
  watch(
    () => workspace.root,
    () => {
      stop();
      targetPath.value = null;
      items.value = [];
      resetResults();
    },
  );

  return {
    targetPath,
    targetName,
    items,
    environmentPath,
    iterations,
    delayMs,
    bail,
    persistVariables,
    status,
    running,
    results,
    current,
    summary,
    error,
    selectedCount,
    unsavedSelected,
    totalSteps,
    progress,
    configure,
    move,
    setAllSelected,
    start,
    stop,
  };
});

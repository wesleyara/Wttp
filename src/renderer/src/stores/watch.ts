import type { HistoryEntry } from "@shared";

import { i18n } from "@renderer/i18n";
import { diffResponses } from "@renderer/lib/responseDiff";
import {
  defaultWatchConfig,
  resultToEntry,
  untilMatches,
  validateWatchConfig,
  type WatchConfig,
} from "@renderer/lib/watch";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { useHistoryStore } from "@renderer/stores/history";
import { type DispatchOutcome, useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useToastStore } from "@renderer/stores/toast";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, shallowRef, watch } from "vue";

export type WatchStopReason =
  | "user"
  | "match"
  | "limit"
  | "edited"
  | "environment"
  | "tabClosed"
  | "unresolved"
  | "preRequestFailed";

/** Uma sessão de watch (#50) — só em memória; a única coisa que chega ao disco é a iteração final, no histórico. */
export interface WatchSession {
  tabId: string;
  config: WatchConfig;
  running: boolean;
  inFlight: boolean;
  iteration: number;
  stopReason: WatchStopReason | null;
  /** Só as duas últimas respostas ficam na memória — o diff é sempre "esta vs. a anterior". */
  previous: HistoryEntry | null;
  current: HistoryEntry | null;
  /** Diferenças da última iteração para a anterior; `null` antes da segunda resposta. */
  changeCount: number | null;
}

interface Controller {
  active: boolean;
  reason: WatchStopReason;
  timer: ReturnType<typeof setTimeout> | null;
  wake: (() => void) | null;
}

function countChanges(before: HistoryEntry, after: HistoryEntry, ignored: string[]): number {
  const diff = diffResponses(before, after, { ignored });
  const body =
    diff.body.mode === "json"
      ? diff.body.changes.length
      : diff.body.mode === "text" && diff.body.changed
        ? 1
        : 0;
  return (diff.status ? 1 : 0) + diff.headers.length + body;
}

export const useWatchStore = defineStore("watch", () => {
  const tabs = useRequestTabsStore();
  const environment = useEnvironmentStore();
  const workspace = useWorkspaceStore();
  const toast = useToastStore();
  const history = useHistoryStore();

  // `shallowRef` + troca imutável: as respostas guardadas podem ter vários MB, e o Vue
  // não precisa tornar cada byte reativo.
  const sessions = shallowRef<Record<string, WatchSession>>({});
  const controllers = new Map<string, Controller>();
  /** Modo do botão de envio por aba (#62): Send ou Watch. Só em memória, como a configuração. */
  const modes = shallowRef<Record<string, "send" | "watch">>({});

  function modeFor(tabId: string): "send" | "watch" {
    return modes.value[tabId] ?? "send";
  }

  function setMode(tabId: string, mode: "send" | "watch"): void {
    modes.value = { ...modes.value, [tabId]: mode };
  }

  /** Última configuração usada por aba — o botão "Watch" recomeça com ela. */
  const configs = new Map<string, WatchConfig>();

  function patch(tabId: string, changes: Partial<WatchSession>): void {
    const current = sessions.value[tabId];
    if (!current) return;
    sessions.value = { ...sessions.value, [tabId]: { ...current, ...changes } };
  }

  const runningIds = computed(() =>
    Object.values(sessions.value)
      .filter(session => session.running)
      .map(session => session.tabId),
  );

  function sessionFor(tabId: string | null | undefined): WatchSession | null {
    return tabId ? (sessions.value[tabId] ?? null) : null;
  }

  function configFor(tabId: string): WatchConfig {
    return configs.get(tabId) ?? defaultWatchConfig();
  }

  function saveConfig(tabId: string, config: WatchConfig): void {
    configs.set(tabId, { ...config });
  }

  /** Para a sessão: quem realmente encerra (e grava a iteração final) é o laço, ao acordar. */
  function stop(tabId: string, reason: WatchStopReason = "user"): void {
    const controller = controllers.get(tabId);
    if (!controller?.active) return;
    controller.active = false;
    controller.reason = reason;
    if (controller.timer) clearTimeout(controller.timer);
    controller.wake?.();
    tabs.cancelTab(tabId);
  }

  function start(tabId: string, config: WatchConfig): boolean {
    if (validateWatchConfig(config) !== null) return false;
    if (controllers.get(tabId)?.active || !tabs.requestTabById(tabId)) return false;
    saveConfig(tabId, config);
    const controller: Controller = { active: true, reason: "user", timer: null, wake: null };
    controllers.set(tabId, controller);
    sessions.value = {
      ...sessions.value,
      [tabId]: {
        tabId,
        config: { ...config },
        running: true,
        inFlight: false,
        iteration: 0,
        stopReason: null,
        previous: null,
        current: null,
        changeCount: null,
      },
    };
    void run(tabId, config, controller);
    return true;
  }

  function sleep(controller: Controller, seconds: number): Promise<void> {
    return new Promise(resolve => {
      controller.wake = resolve;
      controller.timer = setTimeout(resolve, seconds * 1000);
    });
  }

  async function run(tabId: string, config: WatchConfig, controller: Controller): Promise<void> {
    let last: DispatchOutcome | null = null;
    const hasUntil = config.until !== "none";

    while (controller.active) {
      patch(tabId, { inFlight: true });
      const result = await tabs.sendForWatch(tabId);
      patch(tabId, { inFlight: false });

      if (result.kind === "unresolved") {
        controller.active = false;
        controller.reason = "unresolved";
        break;
      }
      if (result.kind === "skipped") {
        if (controller.active) {
          controller.active = false;
          controller.reason = result.preRequestFailed ? "preRequestFailed" : "user";
        }
        break;
      }

      // Uma resposta que chegou junto com o Stop conta como iteração concluída.
      last = result.outcome;
      const tab = tabs.requestTabById(tabId);
      const response = tab?.lastResult;
      if (!tab || !response) break;
      const entry = resultToEntry(response);
      const session = sessions.value[tabId];
      const iteration = (session?.iteration ?? 0) + 1;
      const ignored = workspace.uiState.responseDiffIgnores?.[tab.path] ?? [];
      patch(tabId, {
        iteration,
        previous: session?.current ?? null,
        current: entry,
        changeCount: session?.current ? countChanges(session.current, entry, ignored) : null,
      });

      if (untilMatches(config, { result: response, assertions: tab.scriptRun?.assertions ?? [] })) {
        if (controller.active) {
          controller.active = false;
          controller.reason = "match";
        }
        break;
      }
      if (controller.active && hasUntil && iteration >= config.maxAttempts) {
        controller.active = false;
        controller.reason = "limit";
        break;
      }
      if (!controller.active) break;
      await sleep(controller, config.intervalSeconds);
    }

    await finish(tabId, controller, last);
  }

  /** Encerramento único: grava a iteração final no histórico e avisa por que parou. */
  async function finish(
    tabId: string,
    controller: Controller,
    last: DispatchOutcome | null,
  ): Promise<void> {
    const reason = controller.reason;
    if (last) {
      await tabs.recordWatchIteration(tabId, last);
      // A lista de History só recarrega quando `sending` vira `false`, e isso já passou.
      const tab = tabs.requestTabById(tabId);
      if (tab && tabs.active?.id === tabId) await history.loadFor(tab.path);
    }
    if (reason === "tabClosed") {
      const rest = { ...sessions.value };
      delete rest[tabId];
      sessions.value = rest;
    } else {
      patch(tabId, { running: false, inFlight: false, stopReason: reason });
    }
    controllers.delete(tabId);

    const t = i18n.global.t;
    const iterations = sessions.value[tabId]?.iteration ?? 0;
    if (reason === "match") toast.push(t("watch.toast.match", { count: iterations }), "success");
    else if (reason === "limit")
      toast.push(t("watch.toast.limit", { count: iterations }), "warning");
    else if (reason === "unresolved") toast.push(t("watch.toast.unresolved"), "error");
    else if (reason === "preRequestFailed") toast.push(t("watch.toast.preRequestFailed"), "error");
    else if (reason === "edited") toast.push(t("watch.toast.edited"), "warning");
    else if (reason === "environment") toast.push(t("watch.toast.environment"), "warning");
  }

  // --- Gatilhos de parada: fechar a aba, trocar de environment, editar a request ------
  watch(
    () => tabs.tabs.map(tab => tab.id),
    ids => {
      for (const tabId of controllers.keys()) {
        if (!ids.includes(tabId)) stop(tabId, "tabClosed");
      }
    },
  );
  watch(
    () => environment.activePath,
    () => {
      for (const tabId of [...controllers.keys()]) stop(tabId, "environment");
    },
  );
  watch(
    () => tabs.lastEdit.revision,
    () => {
      const tabId = tabs.lastEdit.tabId;
      if (controllers.get(tabId)?.active) stop(tabId, "edited");
    },
  );

  return {
    sessions,
    runningIds,
    sessionFor,
    configFor,
    saveConfig,
    modeFor,
    setMode,
    start,
    stop,
  };
});

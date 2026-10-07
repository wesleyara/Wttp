import type { GitAheadBehind, WttpError } from "@shared";

import { i18n } from "@renderer/i18n";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { useGitStore } from "@renderer/stores/git";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useSettingsStore } from "@renderer/stores/settings";
import { useToastStore } from "@renderer/stores/toast";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

export type RemoteOperation = "fetch" | "pull" | "push";

export const DEFAULT_FETCH_INTERVAL_MINUTES = 5;

/**
 * Pull/push e ahead/behind (ClickLocal #56). O `git fetch` roda em segundo plano ao abrir o
 * workspace e a cada `gitFetchIntervalMinutes` (0 desliga) — silencioso: falha de rede ou de
 * autenticação num fetch automático nunca vira toast, só some o `↑↓`. Pull/push são sempre
 * explícitos, canceláveis e mostram o erro (já sem credenciais, vindas do main) num toast.
 */
export const useGitRemoteStore = defineStore("gitRemote", () => {
  const workspace = useWorkspaceStore();
  const git = useGitStore();
  const settings = useSettingsStore();
  const tabs = useRequestTabsStore();
  const environment = useEnvironmentStore();
  const toast = useToastStore();

  const state = ref<GitAheadBehind | null>(null);
  const busy = ref<RemoteOperation | null>(null);
  const error = ref<WttpError | null>(null);
  /** Abas sujas que impedem o pull — o diálogo lista por nome. */
  const blockedBy = ref<string[] | null>(null);
  /** Branch que divergiu do remoto — a UI mostra o aviso e o comando sugerido. */
  const diverged = ref(false);

  let operationId: string | null = null;
  let counter = 0;

  const upstream = computed(() => state.value?.upstream ?? null);
  const ahead = computed(() => state.value?.ahead ?? 0);
  const behind = computed(() => state.value?.behind ?? 0);
  const hasRemote = computed(() => state.value?.hasRemote ?? false);
  /** Branch sem upstream mas com remote — o popover oferece "Publish branch". */
  const needsUpstream = computed(
    () => !!git.repository?.branch && hasRemote.value && !upstream.value,
  );

  function currentRoot(): string | null {
    return workspace.ready && git.repository ? workspace.root : null;
  }

  /** Só leitura local — barato, roda a cada refresh do status. */
  async function loadAheadBehind(): Promise<void> {
    const root = currentRoot();
    if (!root) {
      state.value = null;
      return;
    }
    try {
      const next = await window.wttp.git.aheadBehind({ root });
      if (workspace.root === root) state.value = next;
    } catch {
      state.value = null;
    }
  }

  async function backgroundFetch(): Promise<void> {
    const root = currentRoot();
    if (!root || busy.value || !hasRemoteGuess()) return;
    busy.value = "fetch";
    const id = `fetch-${++counter}`;
    operationId = id;
    try {
      const next = await window.wttp.git.fetch({ root, operationId: id });
      if (workspace.root === root) state.value = next;
    } catch {
      // Silencioso: sem rede, sem credencial, remote inexistente — o `↑↓` só fica como estava.
    } finally {
      busy.value = null;
      operationId = null;
    }
  }

  /** Antes do primeiro `aheadBehind` não sabemos se há remote; tentar o fetch custa um erro silencioso. */
  function hasRemoteGuess(): boolean {
    return state.value ? state.value.hasRemote : true;
  }

  async function afterPull(): Promise<void> {
    await git.refresh();
    await workspace.refreshTree();
    await tabs.reloadFromDisk("all", { missing: "mark" });
    await environment.refresh();
  }

  async function run(
    operation: RemoteOperation,
    call: (root: string, id: string) => Promise<GitAheadBehind>,
    successMessage: () => string,
  ): Promise<boolean> {
    const root = currentRoot();
    if (!root || busy.value) return false;
    busy.value = operation;
    error.value = null;
    diverged.value = false;
    const id = `${operation}-${++counter}`;
    operationId = id;
    try {
      const next = await call(root, id);
      if (workspace.root === root) state.value = next;
      if (operation === "pull") await afterPull();
      else await git.refresh();
      toast.push(successMessage(), "success");
      return true;
    } catch (caught) {
      const failure = caught as WttpError;
      if (failure.code === "CANCELLED") return false;
      error.value = failure;
      if (failure.code === "GIT_DIVERGED") diverged.value = true;
      else toast.push(failure.message, "error", 10000);
      return false;
    } finally {
      busy.value = null;
      operationId = null;
    }
  }

  function fetchNow(): Promise<boolean> {
    return run(
      "fetch",
      (root, id) => window.wttp.git.fetch({ root, operationId: id }),
      () => i18n.global.t("toast.gitFetched"),
    );
  }

  /** Pull `--ff-only`. Aba suja bloqueia (mesma regra da troca de branch). */
  async function pull(): Promise<boolean> {
    const dirty = tabs.tabs.filter(tab => tab.dirty).map(tab => tab.title);
    if (dirty.length > 0) {
      blockedBy.value = dirty;
      return false;
    }
    return run(
      "pull",
      (root, id) => window.wttp.git.pull({ root, operationId: id }),
      () => i18n.global.t("toast.gitPulled"),
    );
  }

  /** `setUpstream` = branch sem upstream, publica em `origin`. */
  function push(setUpstream = false): Promise<boolean> {
    return run(
      "push",
      (root, id) => window.wttp.git.push({ root, setUpstream, operationId: id }),
      () => i18n.global.t("toast.gitPushed"),
    );
  }

  async function cancel(): Promise<void> {
    if (operationId) await window.wttp.git.cancel(operationId);
  }

  // --- Fetch em segundo plano -------------------------------------------------------------

  let timer: ReturnType<typeof setInterval> | null = null;

  function intervalMinutes(): number {
    const value = settings.gitFetchIntervalMinutes;
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_FETCH_INTERVAL_MINUTES;
  }

  function restartTimer(): void {
    if (timer) clearInterval(timer);
    timer = null;
    const minutes = intervalMinutes();
    if (minutes > 0) timer = setInterval(() => void backgroundFetch(), minutes * 60_000);
  }

  watch(
    () => [git.repository?.root, git.repository?.branch] as const,
    async () => {
      diverged.value = false;
      error.value = null;
      await loadAheadBehind();
    },
    { immediate: true },
  );
  // Abrir o workspace (ou trocar) → um fetch logo, se não estiver desligado.
  watch(
    () => git.repository?.root,
    async root => {
      state.value = null;
      if (!root) return;
      await loadAheadBehind();
      if (intervalMinutes() > 0) void backgroundFetch();
    },
    { immediate: true },
  );
  // Commit/checkout no terminal mudam ahead/behind sem fetch.
  watch(
    () => git.status,
    () => void loadAheadBehind(),
  );
  watch(() => settings.gitFetchIntervalMinutes, restartTimer, { immediate: true });

  return {
    state,
    busy,
    error,
    blockedBy,
    diverged,
    upstream,
    ahead,
    behind,
    hasRemote,
    needsUpstream,
    loadAheadBehind,
    fetchNow,
    pull,
    push,
    cancel,
  };
});

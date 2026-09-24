import type { GitBranches, GitRef, WttpError } from "@shared";

import { i18n } from "@renderer/i18n";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { useGitStore } from "@renderer/stores/git";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useToastStore } from "@renderer/stores/toast";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

/** Troca pendente de confirmação — workspace dentro de um repositório maior (#54). */
export interface PendingCheckout {
  name: string;
  track: boolean;
}

/**
 * Branches pelo StatusBar (ClickLocal #54): listar, trocar e criar. Nunca troca por cima de
 * aba suja; com o workspace dentro de um repositório maior, confirma antes dizendo que a
 * troca vale para o repositório inteiro. Depois da troca, árvore, abas, badges e
 * environments refletem a branch nova.
 */
export const useBranchesStore = defineStore("branches", () => {
  const workspace = useWorkspaceStore();
  const git = useGitStore();
  const tabs = useRequestTabsStore();
  const environment = useEnvironmentStore();
  const toast = useToastStore();

  const data = ref<GitBranches | null>(null);
  const loading = ref(false);
  const busy = ref(false);
  const error = ref<WttpError | null>(null);

  /** Abas sujas que impedem a troca — o diálogo lista por nome. */
  const blockedBy = ref<string[] | null>(null);
  const pending = ref<PendingCheckout | null>(null);

  const local = computed(() => (data.value?.refs ?? []).filter(item => item.kind === "branch"));
  /** Remotas sem uma local de mesmo nome — só essas oferecem "checkout as local". */
  const remoteOnly = computed(() => {
    const localNames = new Set(local.value.map(item => item.name));
    return (data.value?.refs ?? []).filter(
      item => item.kind === "remote" && !localNames.has(item.name.split("/").slice(1).join("/")),
    );
  });

  async function load(): Promise<void> {
    const root = workspace.root;
    if (!root || !git.repository) return;
    loading.value = true;
    error.value = null;
    try {
      data.value = await window.wttp.git.branches({ root });
    } catch (caught) {
      error.value = caught as WttpError;
    } finally {
      loading.value = false;
    }
  }

  function dirtyTabs(): string[] {
    return tabs.tabs.filter(tab => tab.dirty).map(tab => tab.title);
  }

  /** Depois de trocar ou criar: status, árvore, abas (as que sumiram ficam marcadas) e environments. */
  async function afterSwitch(): Promise<void> {
    await git.refresh();
    await workspace.refreshTree();
    await tabs.reloadFromDisk("all", { missing: "mark" });
    await environment.refresh();
  }

  async function run(action: () => Promise<void>, successMessage: () => string): Promise<boolean> {
    const root = workspace.root;
    if (!root || busy.value) return false;
    busy.value = true;
    error.value = null;
    try {
      await action();
      await afterSwitch();
      toast.push(successMessage(), "success");
      return true;
    } catch (caught) {
      error.value = caught as WttpError;
      toast.push((caught as WttpError).message, "error", 8000);
      return false;
    } finally {
      busy.value = false;
      await load();
    }
  }

  function checkoutNow(target: PendingCheckout): Promise<boolean> {
    const root = workspace.root!;
    return run(
      () => window.wttp.git.checkout({ root, name: target.name, track: target.track }),
      () => i18n.global.t("toast.gitSwitched", { branch: git.repository?.branch ?? target.name }),
    );
  }

  /**
   * Pede a troca para `ref`. Aba suja → bloqueia e lista quais. Workspace numa subpasta do
   * repositório → confirma antes (a troca é do repositório todo). Senão, troca direto.
   */
  async function requestCheckout(item: GitRef): Promise<void> {
    const dirty = dirtyTabs();
    if (dirty.length > 0) {
      blockedBy.value = dirty;
      return;
    }
    const target: PendingCheckout = { name: item.name, track: item.kind === "remote" };
    if (git.repository?.workspacePath) {
      pending.value = target;
      return;
    }
    await checkoutNow(target);
  }

  async function confirmPending(): Promise<void> {
    const target = pending.value;
    pending.value = null;
    if (target) await checkoutNow(target);
  }

  function create(name: string): Promise<boolean> {
    const root = workspace.root!;
    const trimmed = name.trim();
    return run(
      () => window.wttp.git.createBranch({ root, name: trimmed }),
      () => i18n.global.t("toast.gitBranchCreated", { branch: trimmed }),
    );
  }

  return {
    data,
    loading,
    busy,
    error,
    blockedBy,
    pending,
    local,
    remoteOnly,
    load,
    requestCheckout,
    confirmPending,
    create,
  };
});

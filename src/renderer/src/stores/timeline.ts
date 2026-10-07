import type { GitFileVersions, GitLog, GitLogEntry, WttpError } from "@shared";

import { i18n } from "@renderer/i18n";
import { fileDiff } from "@renderer/stores/changes";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { useGitStore } from "@renderer/stores/git";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useToastStore } from "@renderer/stores/toast";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

/** O que se compara com o commit escolhido: o commit anterior, ou o arquivo como está agora. */
export type TimelineCompare = "parent" | "current";

export interface TimelineTarget {
  /** Arquivo no disco, relativo ao workspace (`folder.yaml` para pasta/collection). */
  file: string;
  /** Nome para o cabeçalho — o da request, pasta ou environment. */
  label: string;
}

/** Arquivo que guarda um nó da árvore: a request, ou o `folder.yaml` da pasta/collection. */
export function fileForNode(path: string, kind: "request" | "folder"): string {
  return kind === "folder" ? `${path}/folder.yaml` : path;
}

/**
 * Timeline de um arquivo (ClickLocal #55): `git log --follow` de uma request, pasta/collection
 * ou environment, o diff campo a campo de cada commit, e restaurar uma versão antiga. Só
 * leitura do Git — restaurar grava pelo storage e fica como mudança não commitada.
 */
export const useTimelineStore = defineStore("timeline", () => {
  const workspace = useWorkspaceStore();
  const git = useGitStore();
  const tabs = useRequestTabsStore();
  const toast = useToastStore();

  const target = ref<TimelineTarget | null>(null);
  const log = ref<GitLog | null>(null);
  const loading = ref(false);
  const error = ref<WttpError | null>(null);

  const selectedHash = ref<string | null>(null);
  const compare = ref<TimelineCompare>("parent");
  const versions = ref<GitFileVersions | null>(null);
  const loadingDiff = ref(false);

  const restoring = ref(false);
  /** Restauração esperando confirmação — só existe quando há uma aba suja do mesmo arquivo. */
  const pendingRestore = ref<GitLogEntry | null>(null);

  const entries = computed(() => log.value?.entries ?? []);
  const selected = computed(
    () => entries.value.find(entry => entry.hash === selectedHash.value) ?? null,
  );
  const diff = computed(() => (versions.value ? fileDiff(versions.value) : null));

  /** Nó da árvore dono do arquivo — o que uma aba aberta teria como `path`. */
  const nodePath = computed(() => {
    const file = target.value?.file;
    if (!file) return null;
    if (file.endsWith("/folder.yaml")) return file.slice(0, -"/folder.yaml".length);
    return file.endsWith(".req.yaml") ? file : null;
  });
  const dirtyTabs = computed(() =>
    tabs.tabs.filter(tab => tab.dirty && nodePath.value !== null && tab.path === nodePath.value),
  );

  let versionsRequest = 0;

  async function loadDiff(): Promise<void> {
    versions.value = null;
    const root = workspace.root;
    const entry = selected.value;
    const file = target.value?.file;
    if (!root || !entry || !file) return;
    const requestId = ++versionsRequest;
    loadingDiff.value = true;
    try {
      const result = await window.wttp.git.fileVersions(
        compare.value === "parent"
          ? {
              root,
              path: entry.path,
              from: entry.from ?? entry.path,
              base: `${entry.hash}^`,
              ref: entry.hash,
            }
          : { root, path: file, from: entry.path, base: entry.hash },
      );
      if (requestId === versionsRequest) versions.value = result;
    } catch (caught) {
      if (requestId === versionsRequest) error.value = caught as WttpError;
    } finally {
      if (requestId === versionsRequest) loadingDiff.value = false;
    }
  }

  async function select(hash: string | null): Promise<void> {
    selectedHash.value = hash;
    await loadDiff();
  }

  async function setCompare(next: TimelineCompare): Promise<void> {
    compare.value = next;
    await loadDiff();
  }

  async function load(): Promise<void> {
    const root = workspace.root;
    const file = target.value?.file;
    versions.value = null;
    if (!root || !file) {
      log.value = null;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const result = await window.wttp.git.log({ root, path: file });
      if (target.value?.file !== file) return;
      log.value = result;
      const keep = result.entries.some(entry => entry.hash === selectedHash.value);
      await select(keep ? selectedHash.value : (result.entries[0]?.hash ?? null));
    } catch (caught) {
      error.value = caught as WttpError;
    } finally {
      loading.value = false;
    }
  }

  /** Abre a aba Timeline para um arquivo do workspace. */
  async function open(next: TimelineTarget): Promise<void> {
    if (target.value?.file !== next.file) {
      selectedHash.value = null;
      compare.value = "parent";
      log.value = null;
    }
    target.value = next;
    tabs.openTimelineTab();
    await load();
  }

  function openForNode(path: string, kind: "request" | "folder", label: string): Promise<void> {
    return open({ file: fileForNode(path, kind), label });
  }

  async function restoreNow(entry: GitLogEntry): Promise<boolean> {
    const root = workspace.root;
    const file = target.value?.file;
    if (!root || !file || restoring.value) return false;
    restoring.value = true;
    error.value = null;
    try {
      await window.wttp.git.restore({
        root,
        path: file,
        ref: entry.hash,
        ...(entry.path === file ? {} : { from: entry.path }),
      });
    } catch (caught) {
      error.value = caught as WttpError;
      return false;
    } finally {
      restoring.value = false;
    }
    // O que o disco tem agora é a versão restaurada: abas abertas dele (mesmo sujas, já
    // confirmado) e a árvore leem de novo, e o status do Git passa a listar o arquivo.
    if (nodePath.value) await tabs.reloadFromDisk([nodePath.value]);
    if (file.startsWith("environments/")) await useEnvironmentStore().refresh();
    await workspace.refreshTree();
    await git.refresh();
    await loadDiff();
    toast.push(i18n.global.t("toast.timelineRestored", { hash: entry.shortHash }), "success");
    return true;
  }

  /** Pede a restauração: com uma aba suja do arquivo, antes pergunta (`pendingRestore`). */
  async function restore(entry: GitLogEntry): Promise<boolean> {
    if (dirtyTabs.value.length > 0) {
      pendingRestore.value = entry;
      return false;
    }
    return restoreNow(entry);
  }

  async function confirmRestore(): Promise<boolean> {
    const entry = pendingRestore.value;
    pendingRestore.value = null;
    return entry ? restoreNow(entry) : false;
  }

  function cancelRestore(): void {
    pendingRestore.value = null;
  }

  // Um commit feito no terminal (ou pela aba Changes) muda a história do arquivo aberto.
  watch(
    () => git.repository?.head,
    () => {
      if (tabs.tabs.some(tab => tab.kind === "timeline")) void load();
    },
  );

  watch(
    () => workspace.root,
    () => {
      target.value = null;
      log.value = null;
      selectedHash.value = null;
      versions.value = null;
      pendingRestore.value = null;
    },
  );

  return {
    target,
    log,
    entries,
    loading,
    error,
    selectedHash,
    selected,
    compare,
    versions,
    diff,
    loadingDiff,
    restoring,
    pendingRestore,
    dirtyTabs,
    open,
    openForNode,
    load,
    select,
    setCompare,
    restore,
    confirmRestore,
    cancelRestore,
  };
});

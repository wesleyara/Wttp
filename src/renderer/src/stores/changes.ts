import type {
  EnvironmentFile,
  FolderFile,
  GitFileChange,
  GitFileVersions,
  GitRef,
  RequestFile,
  WorkspaceFile,
  WttpError,
} from "@shared";

import { i18n } from "@renderer/i18n";
import {
  diffEnvironment,
  diffFolder,
  diffRequest,
  type DiffSection,
  diffWorkspace,
  lineDiff,
  type LineDiffEntry,
} from "@renderer/lib/structuralDiff";
import { useGitStore } from "@renderer/stores/git";
import { isChangesTab, useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useToastStore } from "@renderer/stores/toast";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

export interface ChangeGroup {
  /** Pasta do arquivo, relativa ao workspace — `""` para a raiz. */
  folder: string;
  changes: GitFileChange[];
}

export type FileDiff =
  | { mode: "fields"; sections: DiffSection[] }
  /** YAML que não parseia, ou arquivo que não é do Wttp: diff de texto cru. */
  | { mode: "text"; lines: LineDiffEntry[]; invalid: boolean };

function dirOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

/** Diff de um arquivo a partir dos dois lados que `git:fileVersions` devolve. */
export function fileDiff(versions: GitFileVersions): FileDiff {
  const { kind, before, after } = versions;
  const invalid = Boolean(before?.invalid || after?.invalid);
  if (kind === "text" || invalid) {
    return { mode: "text", lines: lineDiff(before?.text ?? "", after?.text ?? ""), invalid };
  }
  const a = before?.data ?? null;
  const b = after?.data ?? null;
  switch (kind) {
    case "request":
      return {
        mode: "fields",
        sections: diffRequest(a as RequestFile | null, b as RequestFile | null),
      };
    case "folder":
      return {
        mode: "fields",
        sections: diffFolder(a as FolderFile | null, b as FolderFile | null),
      };
    case "environment":
      return {
        mode: "fields",
        sections: diffEnvironment(a as EnvironmentFile | null, b as EnvironmentFile | null),
      };
    case "workspace":
      return {
        mode: "fields",
        sections: diffWorkspace(a as WorkspaceFile | null, b as WorkspaceFile | null),
      };
  }
}

/**
 * Aba Changes (ClickLocal #52): o que mudou no workspace desde uma base (`HEAD`, outra
 * branch, tag ou commit — sem checkout), agrupado por pasta, e o diff campo a campo do
 * arquivo selecionado.
 */
export const useChangesStore = defineStore("changes", () => {
  const workspace = useWorkspaceStore();
  const git = useGitStore();
  const tabs = useRequestTabsStore();
  const toast = useToastStore();

  const base = ref("HEAD");
  const refs = ref<GitRef[]>([]);
  const changes = ref<GitFileChange[]>([]);
  const loading = ref(false);
  const error = ref<WttpError | null>(null);

  const selectedPath = ref<string | null>(null);
  const versions = ref<GitFileVersions | null>(null);
  const loadingDiff = ref(false);

  function groupByFolder(list: GitFileChange[]): ChangeGroup[] {
    const byFolder = new Map<string, GitFileChange[]>();
    for (const change of [...list].sort((a, b) => a.path.localeCompare(b.path))) {
      const folder = dirOf(change.path);
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), change]);
    }
    return [...byFolder.entries()].map(([folder, items]) => ({ folder, changes: items }));
  }

  const groups = computed<ChangeGroup[]>(() => groupByFolder(changes.value));

  /**
   * Stage/commit/descartar (#53) só fazem sentido contra o último commit — comparando com
   * outra branch a lista é "o que difere de lá", não "o que dá para commitar".
   */
  const canWrite = computed(() => base.value === "HEAD" && git.repository !== null);
  const stagedGroups = computed(() => groupByFolder(changes.value.filter(change => change.staged)));
  const unstagedGroups = computed(() =>
    groupByFolder(changes.value.filter(change => change.unstaged)),
  );
  const stagedCount = computed(() => changes.value.filter(change => change.staged).length);
  const busy = ref(false);
  const commitMessage = ref("");

  const selected = computed(
    () => changes.value.find(change => change.path === selectedPath.value) ?? null,
  );
  const diff = computed(() => (versions.value ? fileDiff(versions.value) : null));

  let versionsRequest = 0;

  async function select(path: string | null): Promise<void> {
    selectedPath.value = path;
    versions.value = null;
    const root = workspace.root;
    const change = changes.value.find(item => item.path === path);
    if (!root || !change) return;
    const requestId = ++versionsRequest;
    loadingDiff.value = true;
    try {
      const result = await window.wttp.git.fileVersions({
        root,
        path: change.path,
        from: change.from,
        base: base.value,
      });
      if (requestId === versionsRequest) versions.value = result;
    } catch (caught) {
      if (requestId === versionsRequest) error.value = caught as WttpError;
    } finally {
      if (requestId === versionsRequest) loadingDiff.value = false;
    }
  }

  async function load(): Promise<void> {
    const root = workspace.root;
    if (!root || !git.repository) {
      changes.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const [nextChanges, nextRefs] = await Promise.all([
        window.wttp.git.changes({ root, base: base.value }),
        window.wttp.git.refs({ root }),
      ]);
      changes.value = nextChanges;
      refs.value = nextRefs;
      const keep = nextChanges.some(change => change.path === selectedPath.value);
      await select(keep ? selectedPath.value : (nextChanges[0]?.path ?? null));
    } catch (caught) {
      error.value = caught as WttpError;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Abre a aba e, se veio de um nó da árvore ("Show changes"), já seleciona o arquivo dele:
   * a própria request, ou o `folder.yaml`/primeiro arquivo alterado de uma pasta.
   */
  async function open(nodePath?: string): Promise<void> {
    tabs.openChangesTab();
    await load();
    if (!nodePath) return;
    const target =
      changes.value.find(change => change.path === nodePath) ??
      changes.value.find(change => change.path === `${nodePath}/folder.yaml`) ??
      changes.value.find(change => change.path.startsWith(`${nodePath}/`));
    if (target) await select(target.path);
  }

  /** Roda uma escrita Git e atualiza tudo que ela pode ter mudado: status, lista, árvore. */
  async function mutate(action: () => Promise<void>): Promise<boolean> {
    if (!workspace.root || busy.value) return false;
    busy.value = true;
    error.value = null;
    try {
      await action();
      return true;
    } catch (caught) {
      error.value = caught as WttpError;
      return false;
    } finally {
      busy.value = false;
      await git.refresh();
      await load();
    }
  }

  function stage(paths: string[]): Promise<boolean> {
    const root = workspace.root!;
    return mutate(() => window.wttp.git.stage({ root, paths }));
  }

  function unstage(paths: string[]): Promise<boolean> {
    const root = workspace.root!;
    return mutate(() => window.wttp.git.unstage({ root, paths }));
  }

  function stageAll(): Promise<boolean> {
    return stage(changes.value.filter(change => change.unstaged).map(change => change.path));
  }

  /** Abas sujas entre `paths` — a confirmação do descarte avisa que essas edições também somem. */
  function dirtyTabsFor(paths: string[]): string[] {
    const targets = new Set(
      paths.map(path =>
        path.endsWith("/folder.yaml") ? path.slice(0, -"/folder.yaml".length) : path,
      ),
    );
    return tabs.tabs.filter(tab => tab.dirty && targets.has(tab.path)).map(tab => tab.title);
  }

  async function discard(paths: string[]): Promise<boolean> {
    const root = workspace.root!;
    const ok = await mutate(() => window.wttp.git.discard({ root, paths }));
    if (ok) {
      await tabs.reloadFromDisk(paths);
      await workspace.refreshTree();
      toast.push(i18n.global.t("toast.gitDiscarded", { count: paths.length }), "success");
    }
    return ok;
  }

  async function commit(): Promise<boolean> {
    const root = workspace.root!;
    const message = commitMessage.value;
    let hash = "";
    const ok = await mutate(async () => {
      hash = (await window.wttp.git.commit({ root, message })).hash;
    });
    if (ok) {
      commitMessage.value = "";
      toast.push(i18n.global.t("toast.gitCommitted", { hash }), "success");
    }
    return ok;
  }

  async function initRepository(): Promise<boolean> {
    const root = workspace.root!;
    const ok = await mutate(() => window.wttp.git.init({ root }));
    if (ok) {
      await workspace.refreshTree();
      toast.push(i18n.global.t("toast.gitInitialized"), "success");
    }
    return ok;
  }

  async function setBase(next: string): Promise<void> {
    base.value = next || "HEAD";
    await load();
  }

  // Com a aba aberta, o que o app salva (ou o watcher vê) também muda a lista — o `git
  // status` do #51 já roda nesses momentos, e basta acompanhar o resultado dele.
  watch(
    () => git.files,
    () => {
      if (tabs.tabs.some(isChangesTab)) void load();
    },
  );

  watch(
    () => workspace.root,
    () => {
      base.value = "HEAD";
      changes.value = [];
      refs.value = [];
      selectedPath.value = null;
      versions.value = null;
    },
  );

  return {
    base,
    refs,
    changes,
    groups,
    loading,
    error,
    selectedPath,
    selected,
    versions,
    diff,
    loadingDiff,
    canWrite,
    stagedGroups,
    unstagedGroups,
    stagedCount,
    busy,
    commitMessage,
    stage,
    unstage,
    stageAll,
    discard,
    dirtyTabsFor,
    commit,
    initRepository,
    open,
    load,
    select,
    setBase,
  };
});

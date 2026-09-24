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

  const base = ref("HEAD");
  const refs = ref<GitRef[]>([]);
  const changes = ref<GitFileChange[]>([]);
  const loading = ref(false);
  const error = ref<WttpError | null>(null);

  const selectedPath = ref<string | null>(null);
  const versions = ref<GitFileVersions | null>(null);
  const loadingDiff = ref(false);

  const groups = computed<ChangeGroup[]>(() => {
    const byFolder = new Map<string, GitFileChange[]>();
    for (const change of [...changes.value].sort((a, b) => a.path.localeCompare(b.path))) {
      const folder = dirOf(change.path);
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), change]);
    }
    return [...byFolder.entries()].map(([folder, list]) => ({ folder, changes: list }));
  });

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
    open,
    load,
    select,
    setBase,
  };
});

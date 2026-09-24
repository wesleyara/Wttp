import type { GitStatus, WorkspaceTree } from "@shared";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { nodePathForFile, useGitStore } from "./git";
import { useWorkspaceStore } from "./workspace";

const TREE: WorkspaceTree = {
  root: "/ws",
  data: { wttp: 1, name: "WS" },
  environments: [],
  children: [],
};

const STATUS: GitStatus = {
  available: true,
  repository: {
    root: "/repo",
    workspacePath: "ws",
    branch: "main",
    detached: false,
    head: "abc1234",
  },
  files: [
    { path: "api/users/list.req.yaml", status: "modified", staged: false, unstaged: true },
    { path: "api/folder.yaml", status: "modified", staged: false, unstaged: true },
    { path: "api/gone.req.yaml", status: "deleted", staged: false, unstaged: true },
    { path: "environments/dev.yaml", status: "modified", staged: false, unstaged: true },
    { path: "other/new.req.yaml", status: "untracked", staged: false, unstaged: true },
  ],
};

const status = vi.fn(async (): Promise<GitStatus> => STATUS);

beforeEach(() => {
  vi.useRealTimers();
  setActivePinia(createPinia());
  status.mockClear();
  status.mockImplementation(async () => STATUS);
  vi.stubGlobal("window", { wttp: { git: { status } }, addEventListener: vi.fn() });
});

async function openWorkspace(): Promise<void> {
  useWorkspaceStore().tree = { ...TREE };
  await nextTick();
  await vi.waitFor(() => expect(status).toHaveBeenCalled());
  await Promise.resolve();
}

describe("nodePathForFile", () => {
  it("maps requests to themselves and folder.yaml to its folder; the rest isn't a tree node", () => {
    expect(nodePathForFile("api/a.req.yaml")).toBe("api/a.req.yaml");
    expect(nodePathForFile("api/users/folder.yaml")).toBe("api/users");
    expect(nodePathForFile("environments/dev.yaml")).toBeNull();
    expect(nodePathForFile("wttp.yaml")).toBeNull();
  });
});

describe("useGitStore (ClickLocal #51)", () => {
  it("builds per-node badges, folders with changes inside and the only-changed set", async () => {
    const git = useGitStore();
    await openWorkspace();

    expect(git.repository?.branch).toBe("main");
    expect([...git.nodeStatus.entries()]).toEqual([
      ["api/users/list.req.yaml", "modified"],
      ["api", "modified"],
      ["api/gone.req.yaml", "deleted"],
      ["other/new.req.yaml", "untracked"],
    ]);
    expect([...git.foldersWithChanges].sort()).toEqual([
      "api",
      "api/users",
      "environments",
      "other",
    ]);
    expect(git.changedTreePaths.has("api/users/list.req.yaml")).toBe(true);
    expect(git.changedTreePaths.has("api/users")).toBe(true);
  });

  it("refreshes after a rescan of the tree (a save) without a reload", async () => {
    vi.useFakeTimers();
    const git = useGitStore();
    useWorkspaceStore().tree = { ...TREE };
    await vi.runAllTimersAsync();
    status.mockClear();
    status.mockImplementation(async () => ({ ...STATUS, files: [] }));

    useWorkspaceStore().tree = { ...TREE }; // mesmo que `refreshTree()` depois de salvar
    await vi.runAllTimersAsync();

    expect(status).toHaveBeenCalledTimes(1);
    expect(git.files).toEqual([]);
  });

  it("stays empty and quiet without git or outside a repository", async () => {
    status.mockImplementation(async () => ({ available: false, repository: null, files: [] }));
    const git = useGitStore();
    await openWorkspace();

    expect(git.available).toBe(false);
    expect(git.repository).toBeNull();
    expect(git.nodeStatus.size).toBe(0);
  });

  it("keeps working when git status fails, instead of throwing into the UI", async () => {
    status.mockImplementation(async () => {
      throw new Error("boom");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const git = useGitStore();
    await openWorkspace();

    expect(git.repository).toBeNull();
    consoleError.mockRestore();
  });
});

import type { GitFileChange, GitFileVersions, GitStatus, RequestFile } from "@shared";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fileDiff, useChangesStore } from "./changes";
import { useGitStore } from "./git";
import { isChangesTab, useRequestTabsStore } from "./requestTabs";
import { useWorkspaceStore } from "./workspace";

const request = (method: RequestFile["method"]): RequestFile => ({
  wttp: 1,
  name: "List",
  seq: 1,
  method,
  url: "/users",
});

const CHANGES: GitFileChange[] = [
  { path: "users/list.req.yaml", status: "modified", staged: false, unstaged: true },
  { path: "users/folder.yaml", status: "modified", staged: false, unstaged: true },
  { path: "environments/dev.yaml", status: "added", staged: false, unstaged: true },
];

const REPO_STATUS: GitStatus = {
  available: true,
  repository: { root: "/ws", workspacePath: "", branch: "main", detached: false, head: "abc1234" },
  files: CHANGES,
};

const gitChanges = vi.fn(async (): Promise<GitFileChange[]> => CHANGES);
const fileVersions = vi.fn(async (): Promise<GitFileVersions> => ({
  kind: "request",
  before: { text: "", data: request("GET") },
  after: { text: "", data: request("POST") },
}));

beforeEach(() => {
  setActivePinia(createPinia());
  gitChanges.mockClear();
  fileVersions.mockClear();
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    wttp: {
      git: {
        status: vi.fn(async (): Promise<GitStatus> => REPO_STATUS),
        changes: gitChanges,
        refs: vi.fn(async () => [{ name: "main", kind: "branch", current: true }]),
        fileVersions,
      },
      workspace: { setUiState: vi.fn(async () => {}), setDrafts: vi.fn(async () => {}) },
    },
  });
  useWorkspaceStore().tree = {
    root: "/ws",
    data: { wttp: 1, name: "WS" },
    environments: [],
    children: [],
  };
  useGitStore().status = REPO_STATUS;
});

describe("fileDiff", () => {
  it("diffs Wttp files field by field", () => {
    const diff = fileDiff({
      kind: "request",
      before: { text: "", data: request("GET") },
      after: { text: "", data: request("POST") },
    });
    expect(diff).toEqual({
      mode: "fields",
      sections: [
        { id: "method", items: [{ kind: "changed", label: "", before: "GET", after: "POST" }] },
      ],
    });
  });

  it("falls back to a text diff when a side isn't valid YAML", () => {
    const diff = fileDiff({
      kind: "request",
      before: { text: "a: 1\n", data: request("GET") },
      after: { text: "a: [broken\n", invalid: true },
    });
    expect(diff).toEqual({
      mode: "text",
      invalid: true,
      lines: [
        { type: "removed", text: "a: 1" },
        { type: "added", text: "a: [broken" },
      ],
    });
  });
});

describe("useChangesStore (ClickLocal #52)", () => {
  it("opens the tab, groups by folder and selects the first file", async () => {
    const changes = useChangesStore();
    await changes.open();

    expect(useRequestTabsStore().tabs.some(isChangesTab)).toBe(true);
    expect(changes.groups.map(group => group.folder)).toEqual(["environments", "users"]);
    expect(changes.selectedPath).toBe("users/list.req.yaml");
    expect(fileVersions).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/list.req.yaml", base: "HEAD" }),
    );
    expect(changes.diff).toMatchObject({ mode: "fields" });
  });

  it("selects the node's own file when opened from the tree", async () => {
    const changes = useChangesStore();
    await changes.open("users");
    expect(changes.selectedPath).toBe("users/folder.yaml");
  });

  it("reloads against another base without checking anything out", async () => {
    const changes = useChangesStore();
    await changes.open();
    await changes.setBase("feature/x");

    expect(gitChanges).toHaveBeenLastCalledWith({ root: "/ws", base: "feature/x" });
    expect(fileVersions).toHaveBeenLastCalledWith(expect.objectContaining({ base: "feature/x" }));
  });
});

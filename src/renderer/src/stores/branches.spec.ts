import type { GitStatus, RequestNode } from "@shared";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { useBranchesStore } from "./branches";
import { useGitStore } from "./git";
import { isRequestTab, useRequestTabsStore } from "./requestTabs";
import { useWorkspaceStore } from "./workspace";

function status(workspacePath: string): GitStatus {
  return {
    available: true,
    repository: { root: "/repo", workspacePath, branch: "main", detached: false, head: "abc1234" },
    files: [],
  };
}

function requestNode(path: string, url: string): RequestNode {
  return {
    kind: "request",
    path,
    name: path.replace(".req.yaml", ""),
    seq: 1,
    data: { wttp: 1, name: path, seq: 1, method: "GET", url },
  };
}

let disk: Map<string, RequestNode>;
const checkout = vi.fn(async () => {});
let gitStatus: GitStatus;

beforeEach(() => {
  setActivePinia(createPinia());
  checkout.mockClear();
  disk = new Map([
    ["a.req.yaml", requestNode("a.req.yaml", "https://main/a")],
    ["b.req.yaml", requestNode("b.req.yaml", "https://main/b")],
  ]);
  gitStatus = status("");
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    wttp: {
      git: {
        status: vi.fn(async () => gitStatus),
        branches: vi.fn(async () => ({
          repository: gitStatus.repository,
          refs: [],
          outsideChanges: [],
          outsideChangesCount: 0,
        })),
        checkout,
        createBranch: vi.fn(async () => {}),
      },
      node: {
        read: vi.fn(async ({ path }: { path: string }) => {
          const node = disk.get(path);
          if (!node) throw new Error("ENOENT");
          return node;
        }),
      },
      env: { list: vi.fn(async () => []) },
      workspace: {
        rescan: vi.fn(async () => ({
          root: "/ws",
          data: { wttp: 1, name: "WS" },
          environments: [],
          children: [],
        })),
        setUiState: vi.fn(async () => {}),
        setDrafts: vi.fn(async () => {}),
      },
    },
  });
  useWorkspaceStore().tree = {
    root: "/ws",
    data: { wttp: 1, name: "WS" },
    environments: [],
    children: [],
  };
});

async function ready(): Promise<void> {
  const git = useGitStore();
  git.status = gitStatus;
  await nextTick();
  await git.refresh();
}

describe("useBranchesStore (ClickLocal #54)", () => {
  it("blocks the checkout while any tab has unsaved changes, listing them", async () => {
    await ready();
    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");
    tabs.markActiveDirty();

    const branches = useBranchesStore();
    await branches.requestCheckout({ name: "feature/x", kind: "branch" });

    expect(checkout).not.toHaveBeenCalled();
    expect(branches.blockedBy).toEqual(["a"]);
  });

  it("switches right away at the repository root, and reloads/marks the open tabs", async () => {
    await ready();
    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");
    await tabs.openPinned("b.req.yaml");
    checkout.mockImplementation(async () => {
      disk.set("a.req.yaml", requestNode("a.req.yaml", "https://feature/a"));
      disk.delete("b.req.yaml");
    });

    await useBranchesStore().requestCheckout({ name: "feature/x", kind: "branch" });

    expect(checkout).toHaveBeenCalledWith({ root: "/ws", name: "feature/x", track: false });
    const [a, b] = tabs.tabs.filter(isRequestTab);
    expect(a.url).toBe("https://feature/a");
    expect(a.deletedOnDisk).toBeFalsy();
    // Sumiu na branch nova: a aba fica, marcada — não fecha sozinha.
    expect(b.deletedOnDisk).toBe(true);
    expect(tabs.tabs).toHaveLength(2);
  });

  it("asks first when the workspace is a subfolder of a bigger repository", async () => {
    gitStatus = status("tests/api");
    await ready();
    const branches = useBranchesStore();

    await branches.requestCheckout({ name: "origin/feature/y", kind: "remote" });
    expect(checkout).not.toHaveBeenCalled();
    expect(branches.pending).toEqual({ name: "origin/feature/y", track: true });

    await branches.confirmPending();
    expect(checkout).toHaveBeenCalledWith({ root: "/ws", name: "origin/feature/y", track: true });
  });
});

describe("external changes (watcher)", () => {
  it("reload clean tabs of changed files and leave dirty ones alone", async () => {
    await ready();
    const tabs = useRequestTabsStore();
    await tabs.openPinned("a.req.yaml");
    await tabs.openPinned("b.req.yaml");
    const b = tabs.tabs.filter(isRequestTab)[1];
    b.url = "my unsaved edit";
    b.dirty = true;
    disk.set("a.req.yaml", requestNode("a.req.yaml", "https://edited/a"));
    disk.set("b.req.yaml", requestNode("b.req.yaml", "https://edited/b"));

    const workspace = useWorkspaceStore();
    workspace.externalChange = { paths: ["a.req.yaml", "b.req.yaml"], version: 1 };
    await vi.waitFor(() => expect(tabs.tabs.filter(isRequestTab)[0].url).toBe("https://edited/a"));

    expect(tabs.tabs.filter(isRequestTab)[1].url).toBe("my unsaved edit");
  });
});

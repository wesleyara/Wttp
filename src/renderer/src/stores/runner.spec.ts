import type { FolderNode, RequestNode, RunEvent, RunRequestResult, WorkspaceTree } from "@shared";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isRunnerTab, useRequestTabsStore } from "./requestTabs";
import { requestsUnder, useRunnerStore } from "./runner";
import { useWorkspaceStore } from "./workspace";

function req(path: string, seq: number): RequestNode {
  const name = path.split("/").pop()!.replace(".req.yaml", "");
  return { kind: "request", path, name, seq, data: { wttp: 1, name, seq, method: "GET", url: "" } };
}

function dir(path: string, children: (FolderNode | RequestNode)[]): FolderNode {
  const name = path.split("/").pop()!;
  return { kind: "folder", path, name, seq: 1, data: { wttp: 1, name, seq: 1 }, children };
}

const TREE: WorkspaceTree = {
  root: "/ws",
  data: { wttp: 1, name: "WS" },
  environments: [],
  children: [
    dir("api", [
      req("api/login.req.yaml", 1),
      dir("api/users", [req("api/users/list.req.yaml", 1)]),
      req("api/logout.req.yaml", 3),
    ]),
    dir("other", [req("other/x.req.yaml", 1)]),
  ],
};

let emit: (event: RunEvent) => void = () => {};
const start = vi.fn(async () => ({ runId: "run-1" }));
const stop = vi.fn(async () => {});

beforeEach(() => {
  setActivePinia(createPinia());
  start.mockClear();
  stop.mockClear();
  vi.stubGlobal("window", {
    wttp: {
      runner: {
        start,
        stop,
        onEvent: (callback: (event: RunEvent) => void) => {
          emit = callback;
          return () => {};
        },
      },
      workspace: {
        setUiState: vi.fn(async () => {}),
        setDrafts: vi.fn(async () => {}),
        rescan: vi.fn(async () => TREE),
      },
      env: { list: vi.fn(async () => []) },
    },
  });
  useWorkspaceStore().tree = TREE;
});

function result(overrides: Partial<RunRequestResult>): RunRequestResult {
  return {
    iteration: 1,
    index: 0,
    path: "api/login.req.yaml",
    name: "login",
    method: "GET",
    url: "http://x",
    status: 200,
    durationMs: 5,
    passed: true,
    cancelled: false,
    assertions: [],
    console: [],
    unresolved: [],
    ...overrides,
  };
}

describe("requestsUnder", () => {
  it("lists a folder's requests in tree order, nested ones included", () => {
    expect(requestsUnder(TREE.children, "api").map(item => item.path)).toEqual([
      "api/login.req.yaml",
      "api/users/list.req.yaml",
      "api/logout.req.yaml",
    ]);
    expect(requestsUnder(TREE.children, "api/users").map(item => item.path)).toEqual([
      "api/users/list.req.yaml",
    ]);
    expect(requestsUnder(TREE.children, "")).toHaveLength(4);
  });
});

describe("useRunnerStore (EP-13-T01)", () => {
  it("configure points at a folder, selects everything and opens the runner tab", () => {
    const runner = useRunnerStore();
    runner.configure("api", "api");
    expect(runner.items.map(item => item.selected)).toEqual([true, true, true]);
    expect(useRequestTabsStore().tabs.some(isRunnerTab)).toBe(true);
  });

  it("starts with the checked requests in the reordered order, without touching the tree", async () => {
    const runner = useRunnerStore();
    runner.configure("api", "api");
    runner.move(2, 0);
    runner.items[1].selected = false;

    await runner.start();

    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        root: "/ws",
        targetPath: "api",
        selection: ["api/logout.req.yaml", "api/users/list.req.yaml"],
      }),
    );
    expect(TREE.children[0].kind === "folder" && TREE.children[0].children[0].path).toBe(
      "api/login.req.yaml",
    );
  });

  it("tracks progress from runner events and ignores events from other runs", async () => {
    const runner = useRunnerStore();
    runner.configure("api", "api");
    await runner.start();

    emit({ runId: "run-1", type: "started", plan: [], iterations: 2 });
    emit({ runId: "other", type: "requestFinished", result: result({}) });
    emit({
      runId: "run-1",
      type: "requestStarted",
      iteration: 1,
      index: 0,
      path: "api/login.req.yaml",
    });
    expect(runner.current?.path).toBe("api/login.req.yaml");
    emit({ runId: "run-1", type: "requestFinished", result: result({ passed: false }) });
    expect(runner.results).toHaveLength(1);
    expect(runner.running).toBe(true);

    runner.stop();
    expect(stop).toHaveBeenCalledWith("run-1");

    emit({
      runId: "run-1",
      type: "finished",
      summary: {
        total: 1,
        passed: 0,
        failed: 1,
        assertions: { total: 0, passed: 0, failed: 0 },
        durationMs: 10,
        endedEarly: "stopped",
      },
    });
    expect(runner.status).toBe("finished");
    expect(runner.summary?.endedEarly).toBe("stopped");
  });

  it("shows a run that couldn't start as failed", async () => {
    const runner = useRunnerStore();
    runner.configure("api", "api");
    await runner.start();
    emit({
      runId: "run-1",
      type: "failed",
      error: { code: "ENOENT", message: "environment not found" },
    });
    expect(runner.status).toBe("failed");
    expect(runner.error?.message).toBe("environment not found");
  });

  it("closing the runner tab stops a run in progress", async () => {
    const runner = useRunnerStore();
    const tabs = useRequestTabsStore();
    runner.configure("api", "api");
    await runner.start();

    tabs.forceClose("__runner__");
    await Promise.resolve();

    expect(stop).toHaveBeenCalledWith("run-1");
  });
});

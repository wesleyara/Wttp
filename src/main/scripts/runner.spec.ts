import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetScriptRunnerForTests, runScript } from "./runner";

const fork = vi.fn();
vi.mock("electron", () => ({
  utilityProcess: { fork: (...args: unknown[]) => fork(...(args as [])) },
}));

class FakeChild extends EventEmitter {
  postMessage = vi.fn();
  kill = vi.fn(() => this.emit("exit"));
}

function okResult(): { ok: true; vars: Record<string, string>; assertions: []; console: [] } {
  return { ok: true, vars: {}, assertions: [], console: [] };
}

beforeEach(() => {
  fork.mockReset();
  resetScriptRunnerForTests();
});

describe("runScript", () => {
  it("spawns a worker and resolves with its response", async () => {
    const child = new FakeChild();
    fork.mockReturnValue(child);
    child.postMessage.mockImplementation((message: { id: string }) => {
      queueMicrotask(() => child.emit("message", { id: message.id, result: okResult() }));
    });

    const result = await runScript({ code: "1", phase: "preRequest", vars: {} });

    expect(result.ok).toBe(true);
    expect(fork).toHaveBeenCalledTimes(1);
  });

  it("reuses the same worker across calls", async () => {
    const child = new FakeChild();
    fork.mockReturnValue(child);
    child.postMessage.mockImplementation((message: { id: string }) => {
      queueMicrotask(() => child.emit("message", { id: message.id, result: okResult() }));
    });

    await runScript({ code: "1", phase: "preRequest", vars: {} });
    await runScript({ code: "2", phase: "preRequest", vars: {} });

    expect(fork).toHaveBeenCalledTimes(1);
  });

  it("kills the worker and resolves SCRIPT_TIMEOUT when it never responds", async () => {
    vi.useFakeTimers();
    try {
      const child = new FakeChild();
      fork.mockReturnValue(child);

      const promise = runScript({
        code: "while(true){}",
        phase: "preRequest",
        vars: {},
        timeoutMs: 50,
      });
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("SCRIPT_TIMEOUT");
      expect(child.kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers when the worker crashes mid-run, respawning on the next call", async () => {
    const crashingChild = new FakeChild();
    fork.mockReturnValue(crashingChild);

    const promise = runScript({ code: "process.exit()", phase: "preRequest", vars: {} });
    crashingChild.emit("exit");
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/crashed/i);

    const freshChild = new FakeChild();
    fork.mockReturnValue(freshChild);
    freshChild.postMessage.mockImplementation((message: { id: string }) => {
      queueMicrotask(() => freshChild.emit("message", { id: message.id, result: okResult() }));
    });

    const second = await runScript({ code: "1", phase: "preRequest", vars: {} });

    expect(second.ok).toBe(true);
    expect(fork).toHaveBeenCalledTimes(2);
  });
});

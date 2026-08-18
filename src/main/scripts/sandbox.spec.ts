import { describe, expect, it } from "vitest";

import { runInSandbox } from "./sandbox";

describe("runInSandbox", () => {
  it("runs a well-behaved script to completion", () => {
    const result = runInSandbox({ code: "1 + 1", globals: {}, timeoutMs: 1000 });
    expect(result.ok).toBe(true);
  });

  it("kills a script that never returns and reports a timeout", () => {
    const started = Date.now();
    const result = runInSandbox({ code: "while (true) {}", globals: {}, timeoutMs: 50 });
    const elapsed = Date.now() - started;

    expect(result.ok).toBe(false);
    expect(elapsed).toBeLessThan(1000);
    if (!result.ok) expect(result.message).toMatch(/timeout/i);
  });

  it("fails clearly when the script reaches for require", () => {
    const result = runInSandbox({ code: 'require("fs")', globals: {}, timeoutMs: 1000 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/require is not defined/i);
  });

  it("fails clearly when the script reaches for process", () => {
    const result = runInSandbox({ code: "process.exit(1)", globals: {}, timeoutMs: 1000 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/process is not defined/i);
  });

  it("only exposes the globals explicitly passed in", () => {
    const result = runInSandbox({
      code: "if (typeof fs !== 'undefined') throw new Error('fs leaked');",
      globals: { fs: undefined },
      timeoutMs: 1000,
    });
    expect(result.ok).toBe(true);
  });

  it("surfaces an uncaught exception thrown by the script", () => {
    const result = runInSandbox({
      code: 'throw new Error("boom")',
      globals: {},
      timeoutMs: 1000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("boom");
  });
});

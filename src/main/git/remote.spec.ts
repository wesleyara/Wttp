import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DomainError } from "../ipc/errors";
import { resetGitDetectionForTests, runGit } from "./git";
import {
  cancelOperation,
  fetchRemote,
  getAheadBehind,
  pullFastForward,
  pushBranch,
  redactCredentials,
} from "./remote";

let dir: string;
let remote: string;
let alice: string;
let bob: string;

async function configure(path: string): Promise<void> {
  await runGit(path, ["config", "core.autocrlf", "false"]);
  await runGit(path, ["config", "gc.auto", "0"]);
  await runGit(path, ["config", "maintenance.auto", "false"]);
  await runGit(path, ["config", "commit.gpgsign", "false"]);
  await runGit(path, ["config", "user.email", "test@example.com"]);
  await runGit(path, ["config", "user.name", "Test"]);
}

async function commit(path: string, file: string, contents: string): Promise<void> {
  await writeFile(join(path, file), contents);
  await runGit(path, ["add", "-A"]);
  await runGit(path, ["commit", "-q", "-m", `edit ${file}`]);
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as DomainError).code;
  }
  return "OK";
}

beforeEach(async () => {
  resetGitDetectionForTests();
  dir = await mkdtemp(join(tmpdir(), "wttp-gitr-"));
  remote = join(dir, "remote.git");
  alice = join(dir, "alice");
  bob = join(dir, "bob");
  await mkdir(remote);
  await runGit(remote, ["init", "-q", "--bare", "-b", "main"]);

  await mkdir(alice);
  await runGit(alice, ["init", "-q", "-b", "main"]);
  await configure(alice);
  await commit(alice, "wttp.yaml", "wttp: 1\nname: WS\n");
  await runGit(alice, ["remote", "add", "origin", remote]);
  await runGit(alice, ["push", "-q", "-u", "origin", "main"]);

  await runGit(dir, ["clone", "-q", remote, "bob"]);
  await configure(bob);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe("getAheadBehind (ClickLocal #56)", () => {
  it("reports ahead/behind against the upstream", async () => {
    await commit(alice, "a.txt", "1\n");
    await commit(bob, "b.txt", "1\n");
    await runGit(bob, ["push", "-q"]);
    await fetchRemote(alice);
    expect(await getAheadBehind(alice)).toEqual({
      upstream: "origin/main",
      ahead: 1,
      behind: 1,
      hasRemote: true,
    });
  });

  it("reports no upstream for a branch that was never pushed", async () => {
    await runGit(alice, ["switch", "-q", "-c", "local-only"]);
    const state = await getAheadBehind(alice);
    expect(state.upstream).toBeNull();
    expect(state.hasRemote).toBe(true);
  });
});

describe("pullFastForward", () => {
  it("fast-forwards when only behind", async () => {
    await commit(bob, "b.txt", "from bob\n");
    await runGit(bob, ["push", "-q"]);
    const state = await pullFastForward(alice);
    expect(state.behind).toBe(0);
    expect(await readFile(join(alice, "b.txt"), "utf-8")).toBe("from bob\n");
  });

  it("does not touch anything when the branches diverged", async () => {
    await commit(alice, "a.txt", "alice\n");
    await commit(bob, "b.txt", "bob\n");
    await runGit(bob, ["push", "-q"]);
    const headBefore = (await runGit(alice, ["rev-parse", "HEAD"])).trim();

    expect(await codeOf(pullFastForward(alice))).toBe("GIT_DIVERGED");

    expect((await runGit(alice, ["rev-parse", "HEAD"])).trim()).toBe(headBefore);
    expect((await runGit(alice, ["status", "--porcelain"])).trim()).toBe("");
    await expect(readFile(join(alice, "b.txt"), "utf-8")).rejects.toThrow();
  });

  it("refuses a pull on a branch without upstream", async () => {
    await runGit(alice, ["switch", "-q", "-c", "local-only"]);
    expect(await codeOf(pullFastForward(alice))).toBe("GIT_NO_UPSTREAM");
  });
});

describe("pushBranch", () => {
  it("pushes ahead commits", async () => {
    await commit(alice, "a.txt", "1\n");
    const state = await pushBranch(alice);
    expect(state.ahead).toBe(0);
    expect((await runGit(remote, ["rev-parse", "main"])).trim()).toBe(
      (await runGit(alice, ["rev-parse", "HEAD"])).trim(),
    );
  });

  it("offers --set-upstream for a branch without one, and only does it when asked", async () => {
    await runGit(alice, ["switch", "-q", "-c", "feature"]);
    await commit(alice, "f.txt", "1\n");
    expect(await codeOf(pushBranch(alice))).toBe("GIT_NO_UPSTREAM");
    const state = await pushBranch(alice, true);
    expect(state.upstream).toBe("origin/feature");
  });

  it("never force-pushes: a rejected push leaves the remote untouched", async () => {
    await commit(bob, "b.txt", "bob\n");
    await runGit(bob, ["push", "-q"]);
    const remoteHead = (await runGit(remote, ["rev-parse", "main"])).trim();
    await commit(alice, "a.txt", "alice\n");

    expect(await codeOf(pushBranch(alice))).toBe("GIT_PUSH_REJECTED");
    expect((await runGit(remote, ["rev-parse", "main"])).trim()).toBe(remoteHead);
  });
});

describe("credentials and cancellation", () => {
  it("masks user:password in URLs", () => {
    expect(redactCredentials("fatal: unable to access 'https://bob:s3cret@host/r.git/'")).toBe(
      "fatal: unable to access 'https://***@host/r.git/'",
    );
    expect(redactCredentials("ssh://git@host/x")).toBe("ssh://***@host/x");
  });

  it("never leaks a credential in the error of a failing fetch, and never prompts", async () => {
    await runGit(alice, ["remote", "set-url", "origin", "https://bob:s3cret@127.0.0.1:1/r.git"]);
    let message = "";
    try {
      await fetchRemote(alice);
    } catch (error) {
      message = JSON.stringify({
        message: (error as DomainError).message,
        detail: (error as DomainError).detail,
      });
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("s3cret");
  });

  it.skipIf(process.platform === "win32")("cancels an operation in flight", async () => {
    // Hook de pre-… não existe para fetch; um remote que demora é um script de `core.sshCommand`.
    const slow = join(dir, "slow.sh");
    await writeFile(slow, "#!/bin/sh\nsleep 20\n");
    await chmod(slow, 0o755);
    await runGit(alice, ["remote", "set-url", "origin", "ssh://example.invalid/r.git"]);
    const previous = process.env.GIT_SSH_COMMAND;
    process.env.GIT_SSH_COMMAND = slow;
    try {
      const pending = codeOf(fetchRemote(alice, "op-1"));
      await new Promise(resolve => setTimeout(resolve, 300));
      cancelOperation("op-1");
      expect(await pending).toBe("CANCELLED");
    } finally {
      if (previous === undefined) delete process.env.GIT_SSH_COMMAND;
      else process.env.GIT_SSH_COMMAND = previous;
    }
  });
});

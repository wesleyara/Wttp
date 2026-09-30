import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getGitStatus, resetGitDetectionForTests, runGit } from "./git";
import { commitStaged, discardPaths, initRepository, stagePaths, unstagePaths } from "./write";

let dir: string;
let workspace: string;

async function write(path: string, contents: string | Buffer = "x\n"): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
}

async function initRepo(path: string, identity = true): Promise<void> {
  await mkdir(path, { recursive: true });
  await runGit(path, ["init", "-q", "-b", "main"]);
  // O Git do Windows vem com core.autocrlf=true e trocaria LF por CRLF em todo checkout
  // (discard, troca de branch), quebrando as comparações byte a byte abaixo.
  await runGit(path, ["config", "core.autocrlf", "false"]);
  // Sem isso o git pode disparar `gc --auto`/maintenance em segundo plano depois de um
  // commit grande e ainda estar escrevendo em `.git/objects/pack` quando o afterEach
  // apaga a pasta (ENOTEMPTY no macOS).
  await runGit(path, ["config", "gc.auto", "0"]);
  await runGit(path, ["config", "maintenance.auto", "false"]);
  await runGit(path, ["config", "commit.gpgsign", "false"]);
  if (identity) {
    await runGit(path, ["config", "user.email", "test@example.com"]);
    await runGit(path, ["config", "user.name", "Test"]);
  }
}

async function lastCommitFiles(cwd: string): Promise<string[]> {
  const out = await runGit(cwd, ["show", "--name-only", "--format=", "HEAD"]);
  return out.split("\n").filter(Boolean).sort();
}

beforeEach(async () => {
  resetGitDetectionForTests();
  dir = await mkdtemp(join(tmpdir(), "wttp-gitw-"));
  workspace = join(dir, "api-tests");
  await initRepo(dir);
  await write(join(workspace, "wttp.yaml"), "wttp: 1\nname: WS\n");
  await write(join(workspace, ".gitignore"), ".wttp/\n");
  await write(join(workspace, "users", "list.req.yaml"), "wttp: 1\nname: List\n");
  await write(join(dir, "src", "server.ts"), "code\n");
  await runGit(dir, ["add", "-A"]);
  await runGit(dir, ["commit", "-q", "-m", "init"]);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe("commitStaged (ClickLocal #53)", () => {
  it("commits only workspace paths, even with changes in the rest of the repository", async () => {
    await write(join(workspace, "users", "list.req.yaml"), "wttp: 1\nname: Changed\n");
    await write(join(workspace, "users", "new.req.yaml"), "wttp: 1\nname: New\n");
    await write(join(dir, "src", "server.ts"), "changed outside\n");

    await stagePaths(workspace, ["users/list.req.yaml", "users/new.req.yaml"]);
    const { hash } = await commitStaged(workspace, "Update users requests");

    expect(hash).toMatch(/^[0-9a-f]{7,}$/);
    expect(await lastCommitFiles(dir)).toEqual([
      "api-tests/users/list.req.yaml",
      "api-tests/users/new.req.yaml",
    ]);
    // O arquivo de fora continua alterado e fora do commit.
    expect(await runGit(dir, ["status", "--porcelain", "--", "src"])).toContain("src/server.ts");
  });

  it("refuses to commit when something outside the workspace is already staged", async () => {
    await write(join(dir, "src", "server.ts"), "changed outside\n");
    await runGit(dir, ["add", "src/server.ts"]);
    await write(join(workspace, "users", "list.req.yaml"), "wttp: 1\nname: Changed\n");
    await stagePaths(workspace, ["users/list.req.yaml"]);

    await expect(commitStaged(workspace, "msg")).rejects.toMatchObject({
      code: "GIT_OUTSIDE_WORKSPACE",
      detail: "src/server.ts",
    });
    expect((await runGit(dir, ["log", "--oneline"])).trim().split("\n")).toHaveLength(1);
  });

  it("refuses to commit anything inside .wttp/", async () => {
    await write(join(workspace, ".wttp", "secrets.json"), '{"token":"s3cr3t"}');
    await runGit(workspace, ["add", "-f", ".wttp/secrets.json"]);

    await expect(commitStaged(workspace, "msg")).rejects.toMatchObject({
      code: "GIT_OUTSIDE_WORKSPACE",
    });
    await expect(stagePaths(workspace, [".wttp/secrets.json"])).rejects.toMatchObject({
      code: "INVALID_PAYLOAD",
    });
  });

  it("runs the user's pre-commit hook and shows its output when it blocks the commit", async () => {
    const hook = join(dir, ".git", "hooks", "pre-commit");
    await write(hook, "#!/bin/sh\necho 'lint failed: users/list.req.yaml' >&2\nexit 1\n");
    await chmod(hook, 0o755);
    await write(join(workspace, "users", "list.req.yaml"), "wttp: 1\nname: Changed\n");
    await stagePaths(workspace, ["users/list.req.yaml"]);

    await expect(commitStaged(workspace, "msg")).rejects.toMatchObject({
      code: "GIT_FAILED",
      message: expect.stringContaining("lint failed: users/list.req.yaml"),
    });
    expect((await runGit(dir, ["log", "--oneline"])).trim().split("\n")).toHaveLength(1);
  });

  it("explains how to set the identity when git doesn't know the author", async () => {
    await runGit(dir, ["config", "--unset", "user.email"]);
    await runGit(dir, ["config", "--unset", "user.name"]);
    // Sem isso o git pode inventar um autor a partir do usuário/hostname da máquina.
    await runGit(dir, ["config", "user.useConfigOnly", "true"]);
    const env = { global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_NOSYSTEM };
    process.env.GIT_CONFIG_GLOBAL = join(dir, "no-global-config");
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    try {
      await write(join(workspace, "users", "list.req.yaml"), "wttp: 1\nname: Changed\n");
      await stagePaths(workspace, ["users/list.req.yaml"]);
      await expect(commitStaged(workspace, "msg")).rejects.toMatchObject({
        code: "GIT_IDENTITY_MISSING",
        message: expect.stringContaining("git config --global user.email"),
      });
    } finally {
      process.env.GIT_CONFIG_GLOBAL = env.global;
      if (env.global === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      if (env.system === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
      else process.env.GIT_CONFIG_NOSYSTEM = env.system;
    }
  });

  it("rejects an empty message and an empty index", async () => {
    await expect(commitStaged(workspace, "   ")).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
    await expect(commitStaged(workspace, "msg")).rejects.toMatchObject({
      message: "nothing staged to commit",
    });
  });
});

describe("stage / unstage / discard", () => {
  it("stages and unstages files, deletions included", async () => {
    await write(join(workspace, "users", "list.req.yaml"), "changed\n");
    await rm(join(workspace, "wttp.yaml"));

    await stagePaths(workspace, ["users/list.req.yaml", "wttp.yaml"]);
    let files = (await getGitStatus(workspace)).files;
    expect(files.every(file => file.staged && !file.unstaged)).toBe(true);

    await unstagePaths(workspace, ["users/list.req.yaml", "wttp.yaml"]);
    files = (await getGitStatus(workspace)).files;
    expect(files.every(file => !file.staged && file.unstaged)).toBe(true);
  });

  it("restores exactly the committed bytes and deletes files the commit doesn't have", async () => {
    const committed = Buffer.from("wttp: 1\r\nname: Ümlaut\r\n\u0000tail", "utf-8");
    await write(join(workspace, "users", "bytes.req.yaml"), committed);
    await runGit(dir, ["add", "-A"]);
    await runGit(dir, ["commit", "-q", "-m", "bytes"]);

    await write(join(workspace, "users", "bytes.req.yaml"), "totally different\n");
    await runGit(workspace, ["add", "users/bytes.req.yaml"]); // staged + worktree
    await write(join(workspace, "users", "untracked.req.yaml"), "new\n");
    await write(join(workspace, "users", "staged-new.req.yaml"), "new\n");
    await runGit(workspace, ["add", "users/staged-new.req.yaml"]);
    await rm(join(workspace, "users", "list.req.yaml"));

    await discardPaths(workspace, [
      "users/bytes.req.yaml",
      "users/untracked.req.yaml",
      "users/staged-new.req.yaml",
      "users/list.req.yaml",
    ]);

    expect(
      Buffer.compare(await readFile(join(workspace, "users", "bytes.req.yaml")), committed),
    ).toBe(0);
    await expect(readFile(join(workspace, "users", "untracked.req.yaml"))).rejects.toThrow();
    await expect(readFile(join(workspace, "users", "staged-new.req.yaml"))).rejects.toThrow();
    expect(await readFile(join(workspace, "users", "list.req.yaml"), "utf-8")).toBe(
      "wttp: 1\nname: List\n",
    );
    expect((await getGitStatus(workspace)).files).toEqual([]);
  });

  it("undoes a rename back to the original name", async () => {
    await runGit(workspace, ["mv", "users/list.req.yaml", "users/renamed.req.yaml"]);
    await discardPaths(workspace, ["users/renamed.req.yaml"]);

    expect(await readFile(join(workspace, "users", "list.req.yaml"), "utf-8")).toBe(
      "wttp: 1\nname: List\n",
    );
    expect((await getGitStatus(workspace)).files).toEqual([]);
  });

  it("never lets a path escape the workspace", async () => {
    await expect(stagePaths(workspace, ["../src/server.ts"])).rejects.toMatchObject({
      code: "PATH_ESCAPES_ROOT",
    });
    await expect(discardPaths(workspace, ["../src/server.ts"])).rejects.toMatchObject({
      code: "PATH_ESCAPES_ROOT",
    });
  });
});

describe("initRepository", () => {
  it("creates a repository with .wttp/ ignored, and refuses inside an existing one", async () => {
    const fresh = await mkdtemp(join(tmpdir(), "wttp-gitinit-"));
    try {
      await write(join(fresh, "wttp.yaml"), "wttp: 1\nname: Fresh\n");
      await initRepository(fresh);
      expect((await getGitStatus(fresh)).repository).not.toBeNull();
      expect(await readFile(join(fresh, ".gitignore"), "utf-8")).toContain(".wttp/");

      // Unstage num repositório sem nenhum commit (sem HEAD).
      await stagePaths(fresh, ["wttp.yaml"]);
      await unstagePaths(fresh, ["wttp.yaml"]);
      expect((await getGitStatus(fresh)).files.find(f => f.path === "wttp.yaml")?.status).toBe(
        "untracked",
      );
    } finally {
      await rm(fresh, { recursive: true, force: true });
    }
    await expect(initRepository(workspace)).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
  });
});

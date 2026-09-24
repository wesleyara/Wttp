import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getGitStatus,
  isGitAvailable,
  parsePorcelainV2,
  resetGitDetectionForTests,
  runGit,
} from "./git";

let dir: string;

beforeEach(async () => {
  resetGitDetectionForTests();
  dir = await mkdtemp(join(tmpdir(), "wttp-git-"));
});

afterEach(async () => {
  resetGitDetectionForTests();
  await rm(dir, { recursive: true, force: true });
});

async function initRepo(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await runGit(path, ["init", "-q", "-b", "main"]);
  await runGit(path, ["config", "user.email", "test@example.com"]);
  await runGit(path, ["config", "user.name", "Test"]);
  await runGit(path, ["config", "commit.gpgsign", "false"]);
}

async function write(path: string, contents = "x\n"): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
}

async function commitAll(cwd: string, message = "c"): Promise<void> {
  await runGit(cwd, ["add", "-A"]);
  await runGit(cwd, ["commit", "-q", "-m", message]);
}

describe("parsePorcelainV2", () => {
  it("parses branch headers, changes, renames, conflicts and untracked files", () => {
    const output = [
      "# branch.oid 1234567890abcdef",
      "# branch.head feature/x",
      "1 .M N... 100644 100644 100644 aaa bbb api/a b.req.yaml",
      "1 A. N... 000000 100644 100644 000 bbb api/new.req.yaml",
      "1 .D N... 100644 100644 000000 aaa aaa api/gone.req.yaml",
      "2 R. N... 100644 100644 100644 aaa aaa R100 api/renamed.req.yaml",
      "api/old.req.yaml",
      "u UU N... 100644 100644 100644 100644 a b c api/conflict.req.yaml",
      "? api/untracked.req.yaml",
      "",
    ].join("\0");

    const parsed = parsePorcelainV2(output);
    expect(parsed).toMatchObject({ branch: "feature/x", detached: false, head: "1234567" });
    expect(parsed.entries).toEqual([
      { path: "api/a b.req.yaml", status: "modified", staged: false, unstaged: true },
      { path: "api/new.req.yaml", status: "added", staged: true, unstaged: false },
      { path: "api/gone.req.yaml", status: "deleted", staged: false, unstaged: true },
      {
        path: "api/renamed.req.yaml",
        status: "added",
        staged: true,
        unstaged: false,
        from: "api/old.req.yaml",
      },
      { path: "api/conflict.req.yaml", status: "conflicted", staged: true, unstaged: true },
      { path: "api/untracked.req.yaml", status: "untracked", staged: false, unstaged: true },
    ]);
  });

  it("recognizes a detached HEAD and a repository without commits", () => {
    expect(parsePorcelainV2("# branch.oid abcdef123\0# branch.head (detached)\0")).toMatchObject({
      branch: null,
      detached: true,
      head: "abcdef1",
    });
    expect(parsePorcelainV2("# branch.oid (initial)\0# branch.head main\0")).toMatchObject({
      branch: "main",
      head: null,
    });
  });
});

describe("getGitStatus (ClickLocal #51)", () => {
  it("reports modified, added, untracked and deleted files of a workspace at the repo root", async () => {
    await initRepo(dir);
    await write(join(dir, "wttp.yaml"), "wttp: 1\n");
    await write(join(dir, ".gitignore"), ".wttp/\n");
    await write(join(dir, "api", "keep.req.yaml"));
    await write(join(dir, "api", "gone.req.yaml"));
    await commitAll(dir);

    await write(join(dir, "api", "keep.req.yaml"), "changed\n");
    await unlink(join(dir, "api", "gone.req.yaml"));
    await write(join(dir, "api", "staged.req.yaml"));
    await runGit(dir, ["add", "api/staged.req.yaml"]);
    await write(join(dir, "api", "new.req.yaml"));
    await write(join(dir, ".wttp", "secrets.json"), "{}");

    const status = await getGitStatus(dir);

    expect(status.available).toBe(true);
    expect(status.repository).toMatchObject({ workspacePath: "", branch: "main", detached: false });
    expect(status.repository?.head).toMatch(/^[0-9a-f]{7}$/);
    expect(status.files).toEqual(
      expect.arrayContaining([
        { path: "api/keep.req.yaml", status: "modified", staged: false, unstaged: true },
        { path: "api/gone.req.yaml", status: "deleted", staged: false, unstaged: true },
        { path: "api/staged.req.yaml", status: "added", staged: true, unstaged: false },
        { path: "api/new.req.yaml", status: "untracked", staged: false, unstaged: true },
      ]),
    );
    expect(status.files).toHaveLength(4);
    expect(status.files.some(file => file.path.startsWith(".wttp"))).toBe(false);
  });

  it("limits the status to a workspace living in a subfolder, with workspace-relative paths", async () => {
    await initRepo(dir);
    const workspace = join(dir, "tests", "api-workspace");
    await write(join(workspace, "wttp.yaml"), "wttp: 1\n");
    await write(join(workspace, "users", "list.req.yaml"));
    await write(join(dir, "src", "server.ts"), "code\n");
    await commitAll(dir);

    await write(join(workspace, "users", "list.req.yaml"), "changed\n");
    await write(join(dir, "src", "server.ts"), "changed too\n");
    await write(join(dir, "README.md"), "outside\n");

    const status = await getGitStatus(workspace);

    expect(status.repository?.workspacePath).toBe("tests/api-workspace");
    expect(status.files).toEqual([
      { path: "users/list.req.yaml", status: "modified", staged: false, unstaged: true },
    ]);
  });

  it("works in a repository without any commit yet", async () => {
    await initRepo(dir);
    await write(join(dir, "wttp.yaml"), "wttp: 1\n");

    const status = await getGitStatus(dir);

    expect(status.repository).toMatchObject({ branch: "main", head: null });
    expect(status.files).toEqual([
      { path: "wttp.yaml", status: "untracked", staged: false, unstaged: true },
    ]);
  });

  it("shows a detached HEAD", async () => {
    await initRepo(dir);
    await write(join(dir, "wttp.yaml"), "wttp: 1\n");
    await commitAll(dir);
    await runGit(dir, ["checkout", "-q", "--detach"]);

    const status = await getGitStatus(dir);
    expect(status.repository).toMatchObject({ branch: null, detached: true });
  });

  it("returns no repository, without throwing, outside of git", async () => {
    await write(join(dir, "wttp.yaml"), "wttp: 1\n");
    await expect(getGitStatus(dir)).resolves.toEqual({
      available: true,
      repository: null,
      files: [],
    });
  });

  it("returns git as unavailable, without throwing, when git isn't on the PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = join(dir, "empty-bin");
    try {
      resetGitDetectionForTests();
      expect(await isGitAvailable()).toBe(false);
      await expect(getGitStatus(dir)).resolves.toEqual({
        available: false,
        repository: null,
        files: [],
      });
    } finally {
      process.env.PATH = originalPath;
      resetGitDetectionForTests();
    }
  });

  it("stays under 300ms for a workspace with 1000 requests", async () => {
    await initRepo(dir);
    await write(join(dir, "wttp.yaml"), "wttp: 1\n");
    await Promise.all(
      Array.from({ length: 1000 }, (_, i) =>
        write(join(dir, `folder-${i % 20}`, `request-${i}.req.yaml`), `name: r${i}\n`),
      ),
    );
    await commitAll(dir);
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        write(join(dir, `folder-${i % 20}`, `request-${i}.req.yaml`), `name: changed ${i}\n`),
      ),
    );
    await getGitStatus(dir); // aquece a detecção e o cache de stat do git

    const startedAt = performance.now();
    const status = await getGitStatus(dir);
    const elapsed = performance.now() - startedAt;

    expect(status.files).toHaveLength(50);
    expect(elapsed).toBeLessThan(300);
  }, 30_000);
});

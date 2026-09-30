import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertSafeRef,
  getChanges,
  getFileVersions,
  getGitStatus,
  isGitAvailable,
  listRefs,
  parsePorcelainV2,
  resetGitDetectionForTests,
  runGit,
} from "./git";

// Cada teste aqui sobe vários processos `git` de verdade; no runner Windows do CI isso
// passa fácil dos 5s padrão do Vitest (e o git morto no meio segura a pasta temporária,
// dando EBUSY no afterEach).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let dir: string;

beforeEach(async () => {
  resetGitDetectionForTests();
  dir = await mkdtemp(join(tmpdir(), "wttp-git-"));
});

afterEach(async () => {
  resetGitDetectionForTests();
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function initRepo(path: string): Promise<void> {
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
  await runGit(path, ["config", "user.email", "test@example.com"]);
  await runGit(path, ["config", "user.name", "Test"]);
  await runGit(path, ["config", "commit.gpgsign", "false"]);
}

async function write(path: string, contents = "x\n"): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
}

const execFileAsync = promisify(execFile);

/**
 * Prepara o repositório do teste sem o timeout de 10s do `runGit` do app: com mil
 * arquivos, `git add -A` passa disso no runner Windows do CI (antivírus escaneando cada
 * arquivo). Estourar o timeout matava o git no meio e o `rm` do afterEach dava EBUSY.
 * O que o teste mede é o `getGitStatus`, não esta preparação.
 */
async function commitAll(cwd: string, message = "c"): Promise<void> {
  const options = { cwd, timeout: 120_000, windowsHide: true };
  await execFileAsync("git", ["add", "-A"], options);
  await execFileAsync("git", ["commit", "-q", "-m", message], options);
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
  }, 180_000);
});

const REQUEST_V1 = `wttp: 1
name: List users
seq: 1
method: GET
url: "{{base}}/users"
headers:
  - { name: X-Api-Version, value: "1", enabled: true }
`;

describe("Changes tab support (ClickLocal #52)", () => {
  async function repoWithWorkspace(): Promise<string> {
    await initRepo(dir);
    const workspace = join(dir, "api-tests");
    await write(join(workspace, "wttp.yaml"), "wttp: 1\nname: WS\n");
    await write(join(workspace, "users", "list.req.yaml"), REQUEST_V1);
    await write(
      join(workspace, "users", "old-name.req.yaml"),
      REQUEST_V1.replace("List users", "Old"),
    );
    await commitAll(dir, "v1");
    return workspace;
  }

  it("lists branches and tags, marking the current branch", async () => {
    const workspace = await repoWithWorkspace();
    await runGit(dir, ["branch", "feature/x"]);
    await runGit(dir, ["tag", "v1.0"]);

    expect(await listRefs(workspace)).toEqual([
      { name: "feature/x", kind: "branch" },
      { name: "main", kind: "branch", current: true },
      { name: "v1.0", kind: "tag" },
    ]);
  });

  it("returns both sides parsed, for a modified request", async () => {
    const workspace = await repoWithWorkspace();
    await write(
      join(workspace, "users", "list.req.yaml"),
      REQUEST_V1.replace('value: "1"', 'value: "2"'),
    );

    const versions = await getFileVersions(workspace, "users/list.req.yaml");

    expect(versions.kind).toBe("request");
    expect(versions.before?.data).toMatchObject({
      headers: [{ name: "X-Api-Version", value: "1" }],
    });
    expect(versions.after?.data).toMatchObject({
      headers: [{ name: "X-Api-Version", value: "2" }],
    });
  });

  it("gives null for the missing side of a new or deleted file, and flags invalid YAML", async () => {
    const workspace = await repoWithWorkspace();
    await write(join(workspace, "users", "new.req.yaml"), "wttp: 1\nname: [broken\n");
    await unlink(join(workspace, "users", "old-name.req.yaml"));

    const created = await getFileVersions(workspace, "users/new.req.yaml");
    expect(created.before).toBeNull();
    expect(created.after).toMatchObject({ invalid: true });
    expect(created.after?.text).toContain("[broken");

    const deleted = await getFileVersions(workspace, "users/old-name.req.yaml");
    expect(deleted.after).toBeNull();
    expect(deleted.before?.data).toMatchObject({ name: "Old" });
  });

  it("compares with another branch without checking it out", async () => {
    const workspace = await repoWithWorkspace();
    await runGit(dir, ["checkout", "-q", "-b", "feature/v2"]);
    await write(join(workspace, "users", "list.req.yaml"), REQUEST_V1.replace("GET", "POST"));
    await write(
      join(workspace, "users", "extra.req.yaml"),
      REQUEST_V1.replace("List users", "Extra"),
    );
    await commitAll(dir, "v2");
    await write(join(workspace, "users", "untracked.req.yaml"), REQUEST_V1);

    const changes = await getChanges(workspace, "main");

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "users/list.req.yaml", status: "modified" }),
        expect.objectContaining({ path: "users/extra.req.yaml", status: "added" }),
        expect.objectContaining({ path: "users/untracked.req.yaml", status: "untracked" }),
      ]),
    );
    const versions = await getFileVersions(workspace, "users/list.req.yaml", "main");
    expect(versions.before?.data).toMatchObject({ method: "GET" });
    expect(versions.after?.data).toMatchObject({ method: "POST" });
    // Continua na mesma branch: comparar não fez checkout.
    expect((await getGitStatus(workspace)).repository?.branch).toBe("feature/v2");
  });

  it("follows a rename through `from`", async () => {
    const workspace = await repoWithWorkspace();
    await runGit(workspace, ["mv", "users/old-name.req.yaml", "users/renamed.req.yaml"]);

    const status = await getGitStatus(workspace);
    const renamed = status.files.find(file => file.path === "users/renamed.req.yaml");
    expect(renamed).toMatchObject({ from: "users/old-name.req.yaml", status: "added" });

    const versions = await getFileVersions(workspace, renamed!.path, "HEAD", renamed!.from);
    expect(versions.before?.data).toMatchObject({ name: "Old" });
  });

  it("refuses refs that could be read as options or ranges", () => {
    for (const ref of ["-x", "--output=/tmp/x", "a..b", "a b", "", "main\n"]) {
      expect(() => assertSafeRef(ref), ref).toThrow(/invalid git ref/);
    }
    for (const ref of ["main", "origin/feature-x", "v1.2.3", "HEAD~3", "a1b2c3d", "release@{1}"]) {
      expect(() => assertSafeRef(ref), ref).not.toThrow();
    }
  });
});

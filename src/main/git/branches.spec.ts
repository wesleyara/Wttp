import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { watchWorkspace } from "../storage/watcher";
import { checkoutBranch, createBranch, getBranches } from "./branches";
import { getGitStatus, resetGitDetectionForTests, runGit } from "./git";

// Cada teste aqui sobe vários processos `git` de verdade; no runner Windows do CI isso
// passa fácil dos 5s padrão do Vitest (e o git morto no meio segura a pasta temporária,
// dando EBUSY no afterEach).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let dir: string;

async function write(path: string, contents = "x\n"): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
}

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

async function commitAll(cwd: string, message: string): Promise<void> {
  await runGit(cwd, ["add", "-A"]);
  await runGit(cwd, ["commit", "-q", "-m", message]);
}

beforeEach(async () => {
  resetGitDetectionForTests();
  dir = await mkdtemp(join(tmpdir(), "wttp-branch-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe("checkoutBranch (ClickLocal #54)", () => {
  it("swaps the workspace files, and the watcher reloads once — not once per file", async () => {
    await initRepo(dir);
    await write(join(dir, "wttp.yaml"), "wttp: 1\nname: WS\n");
    for (let i = 0; i < 30; i++)
      await write(join(dir, "api", `r${i}.req.yaml`), `name: main ${i}\n`);
    await commitAll(dir, "main");
    await runGit(dir, ["switch", "-q", "-c", "feature/x"]);
    for (let i = 0; i < 30; i++)
      await write(join(dir, "api", `r${i}.req.yaml`), `name: feature ${i}\n`);
    await write(join(dir, "api", "only-on-feature.req.yaml"), "name: extra\n");
    await commitAll(dir, "feature");
    await runGit(dir, ["switch", "-q", "main"]);

    const events: string[][] = [];
    const watcher = watchWorkspace(dir, event => events.push(event.changedPaths));
    try {
      await new Promise(resolve => setTimeout(resolve, 200)); // inotify recursivo pronto
      await checkoutBranch(dir, "feature/x");
      await new Promise(resolve => setTimeout(resolve, 1200));
    } finally {
      watcher.close();
    }

    expect(await readFile(join(dir, "api", "r7.req.yaml"), "utf-8")).toBe("name: feature 7\n");
    expect((await getGitStatus(dir)).repository?.branch).toBe("feature/x");
    // Todos os arquivos trocados chegam num único reload. Windows e macOS às vezes
    // entregam, depois do debounce, um evento solto só da pasta (`["api"]`, mtime do
    // diretório) — é um rescan a mais, não um reload por arquivo, então não conta aqui.
    const fileEvents = events.filter(paths => paths.some(path => path.endsWith(".req.yaml")));
    expect(fileEvents).toHaveLength(1);
    expect(fileEvents[0]).toEqual(
      expect.arrayContaining(["api/r0.req.yaml", "api/only-on-feature.req.yaml"]),
    );
  });

  it("lets git refuse a checkout that would lose local changes — nothing is forced", async () => {
    await initRepo(dir);
    await write(join(dir, "a.req.yaml"), "name: main\n");
    await commitAll(dir, "main");
    await runGit(dir, ["switch", "-q", "-c", "other"]);
    await write(join(dir, "a.req.yaml"), "name: other\n");
    await commitAll(dir, "other");
    await runGit(dir, ["switch", "-q", "main"]);
    await write(join(dir, "a.req.yaml"), "name: my local edit\n");

    await expect(checkoutBranch(dir, "other")).rejects.toMatchObject({
      code: "GIT_FAILED",
      message: expect.stringMatching(/would be overwritten by checkout/),
    });
    expect((await getGitStatus(dir)).repository?.branch).toBe("main");
    expect(await readFile(join(dir, "a.req.yaml"), "utf-8")).toBe("name: my local edit\n");
  });

  it("checks a remote branch out as a local one tracking it", async () => {
    const remote = join(dir, "remote.git");
    const repo = join(dir, "repo");
    await mkdir(remote, { recursive: true });
    await runGit(remote, ["init", "-q", "--bare", "-b", "main"]);
    await initRepo(repo);
    await write(join(repo, "a.req.yaml"), "name: main\n");
    await commitAll(repo, "main");
    await runGit(repo, ["remote", "add", "origin", remote]);
    await runGit(repo, ["push", "-q", "origin", "main"]);
    await runGit(repo, ["switch", "-q", "-c", "feature/remote-only"]);
    await commitAll(repo, "empty").catch(() => undefined);
    await runGit(repo, ["push", "-q", "origin", "feature/remote-only"]);
    await runGit(repo, ["switch", "-q", "main"]);
    await runGit(repo, ["branch", "-q", "-D", "feature/remote-only"]);
    await runGit(repo, ["fetch", "-q", "origin"]);

    const before = await getBranches(repo);
    expect(before.refs).toEqual(
      expect.arrayContaining([{ name: "origin/feature/remote-only", kind: "remote" }]),
    );

    await checkoutBranch(repo, "origin/feature/remote-only", true);

    const after = await getGitStatus(repo);
    expect(after.repository?.branch).toBe("feature/remote-only");
    expect((await runGit(repo, ["rev-parse", "--abbrev-ref", "@{upstream}"])).trim()).toBe(
      "origin/feature/remote-only",
    );
  });

  it("rejects refs that could become options", async () => {
    await initRepo(dir);
    await expect(checkoutBranch(dir, "--orphan")).rejects.toMatchObject({
      code: "INVALID_PAYLOAD",
    });
  });
});

describe("getBranches", () => {
  it("reports the repository root and the changes outside a subfolder workspace", async () => {
    await initRepo(dir);
    const workspace = join(dir, "tests", "api");
    await write(join(workspace, "wttp.yaml"), "wttp: 1\nname: WS\n");
    await write(join(dir, "src", "server.ts"), "code\n");
    await commitAll(dir, "init");
    await runGit(dir, ["branch", "feature/y"]);
    await write(join(dir, "src", "server.ts"), "changed\n");
    await write(join(dir, "README.md"), "new\n");
    await write(join(workspace, "wttp.yaml"), "wttp: 1\nname: changed\n");

    const branches = await getBranches(workspace);

    expect(branches.repository).toMatchObject({ workspacePath: "tests/api", branch: "main" });
    expect(branches.refs.map(ref => ref.name)).toEqual(["feature/y", "main"]);
    expect(branches.outsideChangesCount).toBe(2);
    expect(branches.outsideChanges.sort()).toEqual(["README.md", "src/server.ts"]);
  });

  it("has no outside changes when the workspace is the repository root", async () => {
    await initRepo(dir);
    await write(join(dir, "wttp.yaml"), "wttp: 1\nname: WS\n");
    await commitAll(dir, "init");
    await write(join(dir, "wttp.yaml"), "changed\n");

    expect(await getBranches(dir)).toMatchObject({ outsideChanges: [], outsideChangesCount: 0 });
  });
});

describe("createBranch", () => {
  it("creates a branch from the current one and switches to it", async () => {
    await initRepo(dir);
    await write(join(dir, "wttp.yaml"), "wttp: 1\nname: WS\n");
    await commitAll(dir, "init");

    await createBranch(dir, "feature/new-endpoint");
    expect((await getGitStatus(dir)).repository?.branch).toBe("feature/new-endpoint");
  });

  it.each(["bad..name", "-x", "has space", "ends.lock", "a~b"])(
    "refuses the name %j",
    async name => {
      await initRepo(dir);
      await write(join(dir, "wttp.yaml"), "wttp: 1\nname: WS\n");
      await commitAll(dir, "init");
      await expect(createBranch(dir, name)).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
    },
  );
});

describe("never forces", () => {
  it("has no --force / -f / --discard-changes in the branch operations", async () => {
    const source = await readFile(join(__dirname, "branches.ts"), "utf-8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/"--force"|"-f"|"--discard-changes"|"-C"/);
  });
});

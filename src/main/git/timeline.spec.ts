import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getFileVersions, getGitStatus, resetGitDetectionForTests, runGit } from "./git";
import { getFileLog, parseFileLog, restoreFileVersion } from "./timeline";

const execFileAsync = promisify(execFile);

let dir: string;

beforeEach(async () => {
  resetGitDetectionForTests();
  dir = await mkdtemp(join(tmpdir(), "wttp-timeline-"));
});

afterEach(async () => {
  resetGitDetectionForTests();
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function initRepo(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await runGit(path, ["init", "-q", "-b", "main"]);
  for (const [key, value] of [
    ["core.autocrlf", "false"],
    ["gc.auto", "0"],
    ["maintenance.auto", "false"],
    ["user.email", "test@example.com"],
    ["user.name", "Test"],
    ["commit.gpgsign", "false"],
  ]) {
    await runGit(path, ["config", key, value]);
  }
}

async function write(path: string, contents: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
}

async function commitAll(message: string): Promise<void> {
  const options = { cwd: dir, windowsHide: true };
  await execFileAsync("git", ["add", "-A"], options);
  await execFileAsync("git", ["commit", "-q", "-m", message], options);
}

const request = (header: string): string => `wttp: 1
name: List users
seq: 1
method: GET
url: "{{base}}/users"
headers:
  - { name: X-Api-Version, value: "${header}", enabled: true }
`;

describe("parseFileLog", () => {
  it("reads commits, authors, dates and renames", () => {
    const output = [
      "\x01bbb\0b\0Ana\0 2026-10-02T10:00:00+00:00\0rename it\nR100\told.req.yaml\tnew.req.yaml\n",
      "\x01aaa\0a\0Bia\0 2026-10-01T10:00:00+00:00\0first: add\nA\told.req.yaml\n",
    ].join("");

    expect(parseFileLog(output)).toMatchObject([
      { hash: "bbb", author: "Ana", path: "new.req.yaml", from: "old.req.yaml", status: "renamed" },
      { hash: "aaa", subject: "first: add", path: "old.req.yaml", status: "added" },
    ]);
  });
});

describe("getFileLog (ClickLocal #55)", () => {
  it("follows a rename: the timeline has commits before and after it", async () => {
    await initRepo(dir);
    const workspace = join(dir, "api");
    await write(join(workspace, "wttp.yaml"), "wttp: 1\nname: WS\n");
    await write(join(workspace, "users", "list.req.yaml"), request("1"));
    await commitAll("add request");
    await write(join(workspace, "users", "list.req.yaml"), request("2"));
    await commitAll("bump version");
    await rename(
      join(workspace, "users", "list.req.yaml"),
      join(workspace, "users", "all.req.yaml"),
    );
    await commitAll("rename request");
    await write(join(workspace, "users", "all.req.yaml"), request("3"));
    await commitAll("bump again");

    const log = await getFileLog(workspace, "users/all.req.yaml");

    expect(log.inRepository).toBe(true);
    expect(log.entries.map(entry => entry.subject)).toEqual([
      "bump again",
      "rename request",
      "bump version",
      "add request",
    ]);
    expect(log.entries.map(entry => entry.path)).toEqual([
      "users/all.req.yaml",
      "users/all.req.yaml",
      "users/list.req.yaml",
      "users/list.req.yaml",
    ]);
    expect(log.entries[1]).toMatchObject({ status: "renamed", from: "users/list.req.yaml" });
    expect(log.entries[0].author).toBe("Test");
    expect(Number.isNaN(Date.parse(log.entries[0].date))).toBe(false);
  });

  it("is empty for a request that was never committed, and for a repo without commits", async () => {
    await initRepo(dir);
    const workspace = join(dir, "api");
    await write(join(workspace, "new.req.yaml"), request("1"));

    expect((await getFileLog(workspace, "new.req.yaml")).entries).toEqual([]);

    // Com commits no repositório, mas nenhum que toque esse arquivo.
    await write(join(workspace, "wttp.yaml"), "wttp: 1\nname: WS\n");
    await runGit(dir, ["add", "api/wttp.yaml"]);
    await runGit(dir, ["commit", "-q", "-m", "workspace"]);
    const log = await getFileLog(workspace, "new.req.yaml");
    expect(log).toMatchObject({ available: true, inRepository: true, entries: [] });
  });

  it("says when the workspace is not inside a repository", async () => {
    await write(join(dir, "plain", "a.req.yaml"), request("1"));
    // Garante que o `mkdtemp` não está dentro de um repositório do ambiente de teste.
    if ((await getGitStatus(join(dir, "plain"))).repository) return;
    expect(await getFileLog(join(dir, "plain"), "a.req.yaml")).toMatchObject({
      inRepository: false,
      entries: [],
    });
  });

  it("diffs a commit against its parent, and against the current file", async () => {
    await initRepo(dir);
    const workspace = join(dir, "api");
    await write(join(workspace, "a.req.yaml"), request("1"));
    await commitAll("one");
    await write(join(workspace, "a.req.yaml"), request("2"));
    await commitAll("two");
    await write(join(workspace, "a.req.yaml"), request("3"));

    const [two, one] = (await getFileLog(workspace, "a.req.yaml")).entries;

    const parent = await getFileVersions(workspace, two.path, `${two.hash}^`, two.path, two.hash);
    expect(parent.before?.data).toMatchObject({ headers: [{ value: "1" }] });
    expect(parent.after?.data).toMatchObject({ headers: [{ value: "2" }] });

    // O primeiro commit não tem pai: tudo é "adicionado".
    const first = await getFileVersions(workspace, one.path, `${one.hash}^`, one.path, one.hash);
    expect(first.before).toBeNull();
    expect(first.after?.data).toMatchObject({ headers: [{ value: "1" }] });

    const current = await getFileVersions(workspace, "a.req.yaml", two.hash, two.path);
    expect(current.before?.data).toMatchObject({ headers: [{ value: "2" }] });
    expect(current.after?.data).toMatchObject({ headers: [{ value: "3" }] });
  });
});

describe("restoreFileVersion (ClickLocal #55)", () => {
  it("writes the exact bytes of the commit and shows up as modified", async () => {
    await initRepo(dir);
    const workspace = join(dir, "api");
    const v1 = request("1");
    await write(join(workspace, "a.req.yaml"), v1);
    await commitAll("one");
    const [{ hash }] = (await getFileLog(workspace, "a.req.yaml")).entries;
    await write(join(workspace, "a.req.yaml"), request("2"));
    await commitAll("two");

    await restoreFileVersion(workspace, "a.req.yaml", hash);

    expect(await readFile(join(workspace, "a.req.yaml"), "utf-8")).toBe(v1);
    const status = await getGitStatus(workspace);
    expect(status.files).toMatchObject([
      { path: "a.req.yaml", status: "modified", unstaged: true, staged: false },
    ]);
    // Nenhum commit novo: restaurar nunca escreve no histórico.
    expect((await runGit(dir, ["rev-list", "--count", "HEAD"])).trim()).toBe("2");
  });

  it("restores from the pre-rename path into the current one", async () => {
    await initRepo(dir);
    const workspace = join(dir, "api");
    const v1 = request("1");
    await write(join(workspace, "old.req.yaml"), v1);
    await commitAll("one");
    const [{ hash }] = (await getFileLog(workspace, "old.req.yaml")).entries;
    await rename(join(workspace, "old.req.yaml"), join(workspace, "new.req.yaml"));
    await write(join(workspace, "new.req.yaml"), request("2"));
    await commitAll("rename + edit");

    await restoreFileVersion(workspace, "new.req.yaml", hash, "old.req.yaml");

    expect(await readFile(join(workspace, "new.req.yaml"), "utf-8")).toBe(v1);
  });

  it("refuses a version that is not valid YAML, an unknown commit, and unsafe refs", async () => {
    await initRepo(dir);
    const workspace = join(dir, "api");
    await write(join(workspace, "a.req.yaml"), "wttp: 1\nname: [broken\n");
    await commitAll("broken");
    const [{ hash }] = (await getFileLog(workspace, "a.req.yaml")).entries;
    await write(join(workspace, "a.req.yaml"), request("2"));

    await expect(restoreFileVersion(workspace, "a.req.yaml", hash)).rejects.toMatchObject({
      code: "INVALID_PAYLOAD",
    });
    expect(await readFile(join(workspace, "a.req.yaml"), "utf-8")).toBe(request("2"));
    await expect(
      restoreFileVersion(workspace, "a.req.yaml", "0000000000000000000000000000000000000000"),
    ).rejects.toBeDefined();
    await expect(restoreFileVersion(workspace, "a.req.yaml", "--output=x")).rejects.toMatchObject({
      code: "INVALID_PAYLOAD",
    });
    await expect(restoreFileVersion(workspace, "../x.req.yaml", hash)).rejects.toBeDefined();
  });
});

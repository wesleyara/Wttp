import type { Page } from "@playwright/test";

import { _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, LAUNCH_ENV, MAIN_ENTRY, test } from "./fixtures";
import {
  createCollection,
  createRequest,
  createWorkspace,
  fillCodeMirror,
  openRequestTab,
  requestUrlEditor,
  saveActiveTab,
  seedWorkspacesRoot,
  waitForTabSaved,
} from "./helpers";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

/** Simula o "voltei do terminal" — o app atualiza o status Git ao ganhar foco. */
async function focusWindow(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

// ClickLocal #51: branch no StatusBar e badges na árvore, atualizados ao salvar.
test("shows the branch and marks changed requests in the tree", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Git Demo");
  const container = join(workspacesRoot, "wttp");
  const root = join(container, readdirSync(container)[0]);

  // Sem repositório: só um aviso discreto, nada quebrado.
  await expect(window.getByTestId("git-no-repo")).toBeVisible();

  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "e2e@example.com");
  git(root, "config", "user.name", "E2E");
  git(root, "config", "commit.gpgsign", "false");
  await focusWindow(window);
  await expect(window.getByTestId("git-branch")).toContainText("main");

  await createCollection(window);
  await createRequest(window);
  const row = window.getByRole("treeitem").filter({ hasText: "New request" });
  await expect(row.getByTestId("tree-decoration")).toHaveText("U");

  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  await focusWindow(window);
  await expect(row.getByTestId("tree-decoration")).toHaveCount(0);

  // Editar e salvar pelo app: o badge aparece sem reload nem foco.
  await openRequestTab(window, "New request");
  await fillCodeMirror(window, requestUrlEditor(window), "https://example.com/changed");
  await saveActiveTab(electronApp);
  await waitForTabSaved(window);
  await expect(row.getByTestId("tree-decoration")).toHaveText("M");
  await expect(window.getByTestId("git-changes")).toContainText("1 changed");

  // "Only changed": a outra request, sem mudança, some da árvore.
  await createRequest(window);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "second");
  await fillCodeMirror(window, requestUrlEditor(window), "https://example.com/again");
  await saveActiveTab(electronApp);
  await focusWindow(window);
  await window.getByTestId("tree-only-changed").click();
  await expect(window.getByRole("treeitem")).toHaveCount(2); // collection + a request alterada
});

test("opens and works normally on a machine without git on the PATH", async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), "wttp-e2e-nogit-"));
  const workspaces = mkdtempSync(join(tmpdir(), "wttp-e2e-nogit-ws-"));
  const emptyBin = join(userDataDir, "empty-bin");
  mkdirSync(emptyBin);
  writeFileSync(
    join(userDataDir, "settings.json"),
    JSON.stringify({ theme: "system", language: "en", workspacesRootDir: workspaces }),
  );
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, "--headless=new", "--disable-gpu"],
    env: { ...LAUNCH_ENV, PATH: emptyBin },
    colorScheme: null,
  });
  const errors: string[] = [];
  try {
    const window = await app.firstWindow();
    window.on("pageerror", error => errors.push(error.message));
    await window.waitForLoadState("domcontentloaded");

    await createWorkspace(window, "No Git");
    await createCollection(window);
    await createRequest(window);
    await expect(window.getByRole("treeitem").filter({ hasText: "New request" })).toBeVisible();

    await expect(window.getByTestId("git-branch")).toHaveCount(0);
    await expect(window.getByTestId("git-no-repo")).toHaveCount(0);
    await expect(window.getByTestId("tree-only-changed")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(workspaces, { recursive: true, force: true });
  }
});

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixtures";
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

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

// ClickLocal #53: editar → revisar → commitar sem abrir o terminal; e descartar, com a aba
// da request voltando ao conteúdo do commit.
test("stages, commits and discards from the Changes tab", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Commit Demo");
  await createCollection(window);
  await createRequest(window);
  const container = join(workspacesRoot, "wttp");
  const root = join(container, readdirSync(container)[0]);

  // Sem repositório: a aba Changes oferece o `git init`, com `.wttp/` no .gitignore.
  await window.getByTestId("git-no-repo").click();
  await window.getByTestId("git-init").click();
  await expect(window.getByText("Git repository created")).toBeVisible();
  await expect(window.getByTestId("git-branch")).toBeVisible();
  expect(readFileSync(join(root, ".gitignore"), "utf-8")).toContain(".wttp/");
  git(root, "checkout", "-q", "-B", "main");
  git(root, "config", "user.email", "e2e@example.com");
  git(root, "config", "user.name", "E2E");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");

  const collection = readdirSync(root).find(name => name.startsWith("new-collection"))!;
  const file = join(root, collection, "new-request.req.yaml");
  const committed = readFileSync(file);

  await openRequestTab(window, "New request");
  await fillCodeMirror(window, requestUrlEditor(window), "https://api.example.com/v2");
  await saveActiveTab(electronApp);
  await waitForTabSaved(window);

  await window.getByTestId("git-branch").click();
  const panel = window.getByTestId("changes-panel");
  const unstaged = panel.getByTestId("changes-unstaged");
  await unstaged.getByTestId("change-row").first().hover();
  await unstaged.getByTestId("stage-file").first().click();
  await expect(panel.getByTestId("changes-staged").getByTestId("change-row")).toHaveCount(1);

  await panel.getByTestId("commit-message").fill("Point the request to v2");
  await panel.getByTestId("commit-message").press("Control+Enter");
  await expect(window.getByText(/^Committed [0-9a-f]{7}/)).toBeVisible();
  expect(git(root, "log", "-1", "--format=%s").trim()).toBe("Point the request to v2");
  expect(git(root, "show", "--name-only", "--format=", "HEAD").trim()).toBe(
    `${collection}/new-request.req.yaml`,
  );
  const afterCommit = readFileSync(file);
  expect(Buffer.compare(afterCommit, committed)).not.toBe(0);

  // Nova edição salva, e mais uma por cima ainda não salva (aba suja).
  await window.locator("[data-request-tab]").filter({ hasText: "New request" }).click();
  await fillCodeMirror(window, requestUrlEditor(window), "https://api.example.com/v3");
  await saveActiveTab(electronApp);
  await waitForTabSaved(window);
  await fillCodeMirror(window, requestUrlEditor(window), "https://api.example.com/unsaved");

  await window.getByTestId("git-branch").click();
  await unstaged.getByTestId("change-row").first().hover();
  await unstaged.getByTestId("discard-file").first().click();
  const confirm = window.getByTestId("discard-confirm");
  await expect(confirm).toContainText(`${collection}/new-request.req.yaml`);
  await expect(confirm).toContainText("Unsaved edits in New request will be lost too.");
  await window.getByTestId("discard-confirm-button").click();

  await expect(panel).toContainText("Nothing changed");
  expect(Buffer.compare(readFileSync(file), afterCommit)).toBe(0);

  // A aba da request voltou ao conteúdo do commit, limpa.
  await window.locator("[data-request-tab]").filter({ hasText: "New request" }).click();
  await expect(requestUrlEditor(window)).toContainText("https://api.example.com/v2");
  await expect(window.locator('[data-request-tab][aria-selected="true"] .bg-accent')).toHaveCount(
    0,
  );
});

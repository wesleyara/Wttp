import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import {
  createCollection,
  createRequest,
  createWorkspace,
  fillCodeMirror,
  requestUrlEditor,
  saveActiveTab,
  seedWorkspacesRoot,
  waitForTabSaved,
} from "./helpers";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

// ClickLocal #54: criar e trocar de branch pelo StatusBar, com árvore e abas refletindo a
// branch nova, e aba suja bloqueando a troca.
test("creates and switches branches from the status bar", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Branch Demo");
  await createCollection(window);
  await createRequest(window);
  const container = join(workspacesRoot, "wttp");
  const root = join(container, readdirSync(container)[0]);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "e2e@example.com");
  git(root, "config", "user.name", "E2E");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  await window.evaluate(() => window.dispatchEvent(new Event("focus")));

  const branch = window.getByTestId("git-branch");
  await expect(branch).toContainText("main");

  // Cria `feature/second` pelo popover.
  await branch.click();
  await window.getByTestId("create-branch").click();
  await window.getByTestId("new-branch-name").fill("feature/second");
  await window.getByTestId("new-branch-name").press("Enter");
  await expect(branch).toContainText("feature/second");

  // Nesta branch, uma segunda request — aberta numa aba — commitada.
  await createRequest(window);
  const rows = window.getByRole("treeitem").filter({ hasText: "New request" });
  await expect(rows).toHaveCount(2);
  await rows.nth(1).dblclick();
  await fillCodeMirror(window, requestUrlEditor(window), "https://only-on-feature.example.com");
  await saveActiveTab(electronApp);
  await waitForTabSaved(window);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "second request");

  // De volta para main pelo popover: a segunda request some da árvore e a aba dela fica marcada.
  await branch.click();
  await window
    .getByTestId("branch-picker")
    .getByTestId("branch-item")
    .filter({ hasText: /^main$/ })
    .click();
  await expect(branch).toContainText("main");
  await expect(rows).toHaveCount(1);
  await expect(window.getByTestId("deleted-on-branch")).toBeVisible();
  expect(git(root, "branch", "--show-current").trim()).toBe("main");

  // Aba suja bloqueia a troca, listando qual.
  await rows.first().dblclick();
  await fillCodeMirror(window, requestUrlEditor(window), "https://unsaved.example.com");
  await branch.click();
  await window
    .getByTestId("branch-picker")
    .getByTestId("branch-item")
    .filter({ hasText: "feature/second" })
    .click();
  await expect(window.getByTestId("checkout-blocked")).toContainText("New request");
  expect(git(root, "branch", "--show-current").trim()).toBe("main");
});

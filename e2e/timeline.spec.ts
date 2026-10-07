import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { createCollection, createRequest, createWorkspace, seedWorkspacesRoot } from "./helpers";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

// ClickLocal #55: timeline de uma request, diff de cada commit, e restaurar uma versão
// antiga como mudança não commitada.
test("shows a request's history and restores an old version as an uncommitted change", async ({
  window,
  workspacesRoot,
}) => {
  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Timeline Demo");
  await createCollection(window);
  await createRequest(window);

  const container = join(workspacesRoot, "wttp");
  const root = join(container, readdirSync(container)[0]);
  const collection = readdirSync(root).find(name => name.startsWith("new-collection"))!;
  const file = join(root, collection, "new-request.req.yaml");

  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "e2e@example.com");
  git(root, "config", "user.name", "E2E");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "create request");
  const v1 = readFileSync(file, "utf-8");

  writeFileSync(file, v1.replace('url: ""', 'url: "https://api.example.com/users"'));
  git(root, "commit", "-q", "-am", "point at users");
  writeFileSync(
    file,
    readFileSync(file, "utf-8").replace("method: GET", "method: POST") +
      'headers:\n  - { name: X-Api-Version, value: "2", enabled: true }\n',
  );
  git(root, "commit", "-q", "-am", "switch to POST");

  await window.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(window.getByTestId("git-branch")).toBeVisible();

  await window.getByRole("treeitem").filter({ hasText: "New request" }).click({ button: "right" });
  await window.getByRole("menuitem", { name: "Timeline" }).click();

  const panel = window.getByTestId("timeline-panel");
  const rows = panel.getByTestId("timeline-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("switch to POST");
  await expect(rows.nth(2)).toContainText("create request");

  // O commit mais novo contra o anterior: método e header, mas não a URL.
  const diff = panel.getByTestId("timeline-diff");
  await expect(diff.getByTestId("changes-section").filter({ hasText: "Method" })).toContainText(
    "GET→POST",
  );
  await expect(diff.getByTestId("changes-section").filter({ hasText: "Headers" })).toContainText(
    "X-Api-Version",
  );
  await expect(diff).not.toContainText("api.example.com");

  await window.screenshot({ path: "test-results/timeline-light.png" });
  await window.emulateMedia({ colorScheme: "dark" });
  await expect(window.locator("html")).toHaveClass(/dark/);
  await window.screenshot({ path: "test-results/timeline-dark.png" });
  await window.emulateMedia({ colorScheme: "light" });

  // O commit do meio contra o arquivo de agora: a URL é igual, então só método/header.
  await rows.nth(1).click();
  await panel.getByTestId("timeline-compare-current").click();
  await expect(diff.getByTestId("changes-section").filter({ hasText: "Method" })).toContainText(
    "GET→POST",
  );

  // Restaurar o primeiro commit: bytes idênticos, nenhum commit novo, aparece como modified.
  await rows.nth(2).click();
  await panel.getByTestId("timeline-restore").click();
  await expect.poll(() => readFileSync(file, "utf-8")).toBe(v1);
  expect(git(root, "rev-list", "--count", "HEAD").trim()).toBe("3");
  expect(git(root, "status", "--porcelain").trim()).toMatch(/^M .*new-request\.req\.yaml$/);
  await expect(window.getByTestId("git-changes")).toContainText("1 changed");
});

test("explains a request that was never committed", async ({ window, workspacesRoot }) => {
  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Timeline Empty");
  await createCollection(window);
  await createRequest(window);

  const container = join(workspacesRoot, "wttp");
  const root = join(container, readdirSync(container)[0]);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "e2e@example.com");
  git(root, "config", "user.name", "E2E");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "commit", "-q", "--allow-empty", "-m", "empty");

  await window.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(window.getByTestId("git-branch")).toBeVisible();
  await window.getByRole("treeitem").filter({ hasText: "New request" }).click({ button: "right" });
  await window.getByRole("menuitem", { name: "Timeline" }).click();

  await expect(window.getByTestId("timeline-panel")).toContainText("No history yet");
});

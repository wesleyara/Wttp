import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { createCollection, createRequest, createWorkspace, seedWorkspacesRoot } from "./helpers";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

// ClickLocal #52: a aba Changes mostra o que mudou numa request campo a campo, e compara
// com outra branch sem fazer checkout.
test("shows field-level changes and compares with another branch", async ({
  window,
  workspacesRoot,
}) => {
  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Changes Demo");
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
  git(root, "commit", "-q", "-m", "v1");
  git(root, "branch", "v1-baseline");

  // Commit na main: a URL muda.
  const original = readFileSync(file, "utf-8");
  writeFileSync(file, original.replace('url: ""', 'url: "https://api.example.com/users"'));
  git(root, "commit", "-q", "-am", "url");

  // Mudança ainda não commitada, feita por fora do app: método e um header.
  writeFileSync(
    file,
    readFileSync(file, "utf-8").replace("method: GET", "method: POST") +
      'headers:\n  - { name: X-Api-Version, value: "2", enabled: true }\n',
  );

  const branch = window.getByTestId("git-branch");
  await window.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(branch).toContainText("1 changed");
  await branch.click();

  const panel = window.getByTestId("changes-panel");
  await expect(panel.getByTestId("changes-list")).toContainText("new-request");
  const diff = panel.getByTestId("changes-diff");
  await expect(diff.getByTestId("changes-section").filter({ hasText: "Method" })).toContainText(
    "GET→POST",
  );
  await expect(diff.getByTestId("changes-section").filter({ hasText: "Headers" })).toContainText(
    "addedX-Api-Version2",
  );
  await expect(diff).not.toContainText("URL");

  // Contra a branch antiga: aparece também a URL commitada depois — sem trocar de branch.
  await panel.getByTestId("changes-base").locator("select").selectOption("v1-baseline");
  await expect(diff.getByTestId("changes-section").filter({ hasText: "URL" })).toContainText(
    "https://api.example.com/users",
  );
  expect(git(root, "branch", "--show-current").trim()).toBe("main");
});

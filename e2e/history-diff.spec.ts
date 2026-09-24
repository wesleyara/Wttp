import { _electron as electron } from "@playwright/test";
import { createServer } from "node:http";

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
  sendActiveRequest,
  waitForStatus,
  waitForTabSaved,
} from "./helpers";

// ClickLocal #49: comparar duas execuções do histórico, ignorar o que muda sempre, e o
// caminho ignorado continuar ignorado depois de reabrir o app.
test("compares two runs from history and remembers ignored paths", async ({
  electronApp,
  window,
  userDataDir,
  workspacesRoot,
}) => {
  let calls = 0;
  const server = createServer((_req, res) => {
    calls++;
    res.writeHead(200, { "content-type": "application/json", "x-call": String(calls) });
    res.end(
      JSON.stringify({ meta: { timestamp: Date.now() + calls }, data: { total: 10 + calls } }),
    );
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/stats`;

  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "History Diff");
    await createCollection(window);
    await createRequest(window);
    await openRequestTab(window, "New request");
    await fillCodeMirror(window, requestUrlEditor(window), url);
    await saveActiveTab(electronApp);
    await waitForTabSaved(window);
    for (let i = 0; i < 2; i++) {
      await sendActiveRequest(window);
      await waitForStatus(window, "200");
      await expect(window.getByRole("tab", { name: /^History/ })).toContainText(String(i + 1));
    }

    await window.getByRole("tab", { name: /^History/ }).click();
    await window.getByTestId("history-compare-previous").click();
    const compare = window.getByTestId("history-compare");
    await expect(
      compare.getByTestId("diff-body-change").filter({ hasText: "$.data.total" }),
    ).toContainText("11→12");
    await expect(
      compare.getByTestId("diff-body-change").filter({ hasText: "$.meta.timestamp" }),
    ).toBeVisible();
    await expect(compare.getByTestId("diff-header").filter({ hasText: "x-call" })).toBeVisible();

    // Ignorar o timestamp (clique direito → "Ignore this path") e esconder os headers.
    await compare
      .getByTestId("diff-body-change")
      .filter({ hasText: "$.meta.timestamp" })
      .click({ button: "right" });
    await window.getByRole("menuitem", { name: "Ignore this path" }).click();
    await expect(compare.getByTestId("diff-body-change")).toHaveCount(1);
    await expect(compare.getByTestId("diff-ignore-chip")).toContainText("$.meta.timestamp");
    await compare.getByLabel("Ignore headers").check();
    await expect(compare.getByTestId("diff-header")).toHaveCount(0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  // Outra sessão: o caminho continua ignorado.
  await electronApp.close();
  const reopened = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, "--headless=new", "--disable-gpu"],
    env: LAUNCH_ENV,
    colorScheme: null,
  });
  try {
    const page = await reopened.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await openRequestTab(page, "New request");
    await page.getByRole("tab", { name: /^History/ }).click();
    await page.getByTestId("history-compare-previous").click();
    const compare = page.getByTestId("history-compare");
    await expect(compare.getByTestId("diff-ignore-chip")).toContainText("$.meta.timestamp");
    await expect(compare.getByTestId("diff-body-change")).toHaveCount(1);
    await expect(compare.getByTestId("diff-body-change")).toContainText("$.data.total");
  } finally {
    await reopened.close();
  }
});

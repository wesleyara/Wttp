import { expect, test } from "./fixtures";
import {
  createCollection,
  createRequest,
  createWorkspace,
  fillCodeMirror,
  requestUrlEditor,
  saveActiveTab,
  seedWorkspacesRoot,
  startEchoServer,
  waitForTabSaved,
} from "./helpers";

// EP-13-T01 (ClickLocal #32): rodar uma collection pelo menu de contexto da árvore e ver
// o relatório — uma request passa, a outra falha num teste, e a falha não interrompe a
// execução.
test("runs a collection from the tree and reports passed and failed requests", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  const echo = await startEchoServer();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Runner");
    await createCollection(window);

    const scripted = async (nth: number, path: string, expectedStatus: number): Promise<void> => {
      await createRequest(window);
      await window.getByRole("treeitem").filter({ hasText: "New request" }).nth(nth).click();
      await fillCodeMirror(window, requestUrlEditor(window), `${echo.url}${path}`);
      await window.getByRole("tab", { name: "Scripts" }).click();
      await window.getByRole("tab", { name: "Post-response" }).click();
      await fillCodeMirror(
        window,
        window.getByTestId("script-tests-editor"),
        `test("status is ${expectedStatus}", () => expect(res.status).toBe(${expectedStatus}));`,
      );
      await saveActiveTab(electronApp);
      await waitForTabSaved(window);
    };
    await scripted(0, "/one", 200);
    await window.getByRole("treeitem").filter({ hasText: "New collection" }).click();
    await scripted(1, "/two", 201);

    await window
      .getByRole("treeitem")
      .filter({ hasText: "New collection" })
      .click({ button: "right" });
    await window.getByRole("menuitem", { name: "Run…" }).click();

    const panel = window.getByTestId("runner-panel");
    await expect(panel.getByText("2 of 2 selected")).toBeVisible();
    await panel.getByTestId("runner-run").click();

    const summary = panel.getByTestId("runner-summary");
    await expect(summary).toContainText("1 passed");
    await expect(summary).toContainText("1 failed");
    await expect(summary).toContainText("1/2 assertions");

    // Detalhe da request que falhou: a asserção e a mensagem.
    await panel.getByTestId("runner-results").getByRole("button").nth(1).click();
    await expect(panel.getByText("status is 201", { exact: true })).toBeVisible();

    // Só a segunda, desmarcando a primeira: roda uma request só.
    await panel.getByRole("checkbox", { name: "Include New request" }).first().uncheck();
    await panel.getByTestId("runner-run").click();
    await expect(summary).toContainText("0 passed");
    await expect(summary).toContainText("1 failed");
    await expect(summary).toContainText("1 / 1");
  } finally {
    await echo.close();
  }
});

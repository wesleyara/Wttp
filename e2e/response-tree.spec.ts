import { expect, test } from "./fixtures";
import {
  createCollection,
  createRequest,
  createWorkspace,
  fillCodeMirror,
  openRequestTab,
  requestUrlEditor,
  seedWorkspacesRoot,
  sendActiveRequest,
  startEchoServer,
  waitForStatus,
} from "./helpers";

// Card #47 (ClickLocal): clicar num valor da árvore da resposta e "Save to variable" —
// a linha entra no script de tests, roda no envio seguinte e a variável fica disponível
// para `{{var}}` (o fluxo "login → token → request autenticada", com o eco no lugar).
test("turns a clicked response value into a variable and an assertion", async ({
  window,
  workspacesRoot,
}) => {
  const echo = await startEchoServer();

  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Tree Workspace");
    await createCollection(window);
    await createRequest(window);
    await openRequestTab(window, "New request");

    await window.getByTitle("Manage environments").click();
    await window.getByRole("button", { name: "+ New environment" }).click();
    await window.getByPlaceholder("Environment name").fill("Env");
    await window.getByPlaceholder("Name", { exact: true }).first().fill("seed");
    await window.getByRole("button", { name: "Save", exact: true }).click();
    await openRequestTab(window, "New request");
    await window.getByTitle("Active environment").click();
    await window.getByRole("option", { name: /^Env/ }).click();

    await fillCodeMirror(window, requestUrlEditor(window), `${echo.url}/greet?name=alpha`);
    await sendActiveRequest(window);
    await waitForStatus(window, "200");

    await window.getByRole("combobox").filter({ hasText: "Pretty" }).selectOption("tree");
    const tree = window.getByTestId("json-tree");
    await tree.getByTestId("json-tree-row").filter({ hasText: "query" }).click();
    const nameRow = tree.getByTestId("json-tree-row").filter({ hasText: "name" });

    // Regressão: Escape fecha o menu de contexto (o `open` era mutado direto num shallowRef).
    await nameRow.click({ button: "right" });
    await window.keyboard.press("Escape");
    await expect(window.getByRole("menu")).toHaveCount(0);

    await nameRow.click({ button: "right" });
    await window.getByRole("menuitem", { name: "Save to variable on every send" }).click();
    await window.getByTestId("json-tree-var-name").locator("input").fill("who");
    await window.getByTestId("json-tree-confirm").click();

    await nameRow.click({ button: "right" });
    await window.getByRole("menuitem", { name: "Add assertion: equals current value" }).click();

    await window.getByRole("tab", { name: "Scripts" }).click();
    await window.getByRole("tab", { name: "Post-response" }).click();
    const script = window.getByTestId("script-tests-editor").locator(".cm-content");
    await expect(script).toContainText('wttp.setVar("who", res.json.query.name);');
    await expect(script).toContainText("expect(res.json.query.name).toBe(");

    // Envio seguinte: o script roda, grava `who` no environment e a asserção passa.
    await sendActiveRequest(window);
    await waitForStatus(window, "200");
    await window.getByRole("tab", { name: "Tests" }).click();
    await expect(window.getByText("1/1 passed")).toBeVisible();

    // A variável já serve de `{{who}}` numa request que dependa dela.
    await fillCodeMirror(window, requestUrlEditor(window), `${echo.url}/greet?name={{who}}`);
    await sendActiveRequest(window);
    await waitForStatus(window, "200");
    await window.getByRole("tab", { name: "Response", exact: true }).click();
    await expect(window.getByTestId("response-body-viewer").locator(".cm-content")).toContainText(
      '"name": "alpha"',
    );
  } finally {
    await echo.close();
  }
});

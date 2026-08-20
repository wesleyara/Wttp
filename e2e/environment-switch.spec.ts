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

// EP-10-T02, fluxo 2: trocar de environment e reenviar a mesma request — confere que o
// valor de `{{variável}}` realmente usado muda com o environment ativo, não só que a UI
// mostra o nome certo. O servidor local ecoa a query string recebida de volta no corpo
// da resposta, então o valor que chegou no request é observável na aba Body.
test("resolves the active environment's variable value when the request is resent", async ({
  window,
  workspacesRoot,
}) => {
  const echo = await startEchoServer();

  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Env Workspace");
    await createCollection(window);
    await createRequest(window);
    await openRequestTab(window, "New request");

    await fillCodeMirror(window, requestUrlEditor(window), `${echo.url}/greet?name={{greeting}}`);

    // Cria os dois environments com o mesmo nome de variável e valores diferentes.
    await window.getByTitle("Manage environments").click();
    const modal = window.getByRole("dialog");

    await modal.getByRole("button", { name: "+ New environment" }).click();
    await modal.getByPlaceholder("Environment name").fill("Env A");
    const nameFieldA = modal.getByPlaceholder("Name", { exact: true }).first();
    await nameFieldA.fill("greeting");
    const rowA = nameFieldA.locator(
      'xpath=ancestor::div[contains(@class,"h-8")][1]//div[contains(@class,"cm-editor")]',
    );
    await fillCodeMirror(window, rowA, "alpha");
    await modal.getByRole("button", { name: "Save", exact: true }).click();

    await modal.getByRole("button", { name: "+ New environment" }).click();
    await modal.getByPlaceholder("Environment name").fill("Env B");
    const nameFieldB = modal.getByPlaceholder("Name", { exact: true }).first();
    await nameFieldB.fill("greeting");
    const rowB = nameFieldB.locator(
      'xpath=ancestor::div[contains(@class,"h-8")][1]//div[contains(@class,"cm-editor")]',
    );
    await fillCodeMirror(window, rowB, "beta");
    await modal.getByRole("button", { name: "Save", exact: true }).click();

    // `WModal` também tem um botão "X" com o mesmo nome acessível ("Close", via
    // `title`) — o do rodapé (texto visível) vem depois no DOM.
    await modal.getByRole("button", { name: "Close", exact: true }).last().click();

    // Env A ativo → resposta carrega "alpha".
    await window.getByTitle("Active environment").click();
    await window.getByRole("option", { name: "Env A" }).click();
    await sendActiveRequest(window);
    await waitForStatus(window, "200");
    await expect(window.getByTestId("response-body-viewer").locator(".cm-content")).toContainText(
      "alpha",
    );

    // Env B ativo → mesma request, mesmo clique em Send, valor diferente na resposta.
    await window.getByTitle("Active environment").click();
    await window.getByRole("option", { name: "Env B" }).click();
    await sendActiveRequest(window);
    await waitForStatus(window, "200");
    await expect(window.getByTestId("response-body-viewer").locator(".cm-content")).toContainText(
      "beta",
    );
  } finally {
    await echo.close();
  }
});

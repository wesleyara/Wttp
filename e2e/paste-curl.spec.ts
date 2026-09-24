import type { ElectronApplication, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  createCollection,
  createRequest,
  createWorkspace,
  openRequestTab,
  requestUrlEditor,
  seedWorkspacesRoot,
  sendActiveRequest,
  startEchoServer,
  waitForStatus,
} from "./helpers";

/** Cola `text` na URL bar por um paste de verdade: clipboard do SO + Ctrl+V no editor. */
async function pasteIntoUrlBar(
  electronApp: ElectronApplication,
  page: Page,
  text: string,
): Promise<void> {
  await electronApp.evaluate(({ clipboard }, value) => clipboard.writeText(value), text);
  await requestUrlEditor(page).locator(".cm-content").click();
  await page.keyboard.press("Control+v");
}

// Card #45 (ClickLocal): colar um `curl ...` na URL bar monta a request inteira, sem
// passar pelo modal de import — e nunca por cima de uma aba que já tem conteúdo.
test("pasting a cURL into a new request fills it, and sending it works", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  const echo = await startEchoServer();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Paste cURL");
    await createCollection(window);
    await createRequest(window);
    await openRequestTab(window, "New request");

    // Formato "Copy as cURL (bash)" do Chrome: continuação de linha e aspas simples.
    const command = [
      `curl '${echo.url}/items?page=2' \\`,
      "  -H 'X-Trace: abc' \\",
      '  --data-raw \'{"name":"widget"}\'',
    ].join("\n");
    await pasteIntoUrlBar(electronApp, window, command);

    const url = requestUrlEditor(window);
    await expect(url).toContainText(`${echo.url}/items?page=2`);
    await expect(window.locator("[data-request-tab]")).toHaveCount(1);
    await expect(window.locator("[data-request-tab]").first()).toContainText("POST");

    await sendActiveRequest(window);
    await waitForStatus(window, "200");
    const responseBody = window.getByTestId("response-body-viewer").locator(".cm-content");
    await expect(responseBody).toContainText('"method": "POST"');
    await expect(responseBody).toContainText('"page": "2"');
    await expect(responseBody).toContainText('\\"name\\":\\"widget\\"');

    // Agora a aba tem conteúdo: outro cURL colado vai para uma request nova.
    await pasteIntoUrlBar(electronApp, window, `curl ${echo.url}/other`);
    await expect(window.locator("[data-request-tab]")).toHaveCount(2);
    await expect(requestUrlEditor(window)).toContainText(`${echo.url}/other`);
    await window.locator("[data-request-tab]").first().click();
    await expect(requestUrlEditor(window)).toContainText(`${echo.url}/items?page=2`);

    // cURL inválido não cola nada — só avisa.
    await pasteIntoUrlBar(electronApp, window, "curl -X POST -H 'X-A: 1'");
    await expect(
      window.getByText("That doesn't look like a valid cURL command — nothing was pasted"),
    ).toBeVisible();
    await expect(requestUrlEditor(window)).toContainText(`${echo.url}/items?page=2`);
    await expect(requestUrlEditor(window)).not.toContainText("X-A");
  } finally {
    await echo.close();
  }
});

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

// Card #48 (ClickLocal): Ctrl+F no body de uma resposta JSON abre o filtro JSONPath (e não
// a busca de texto do CodeMirror); o filtro troca só o que é exibido.
test("filters a JSON response with JSONPath from Ctrl+F", async ({ window, workspacesRoot }) => {
  const echo = await startEchoServer();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Filter");
    await createCollection(window);
    await createRequest(window);
    await openRequestTab(window, "New request");
    await fillCodeMirror(window, requestUrlEditor(window), `${echo.url}/items?page=2&size=10`);
    await sendActiveRequest(window);
    await waitForStatus(window, "200");

    const body = window.getByTestId("response-body-viewer").locator(".cm-content");
    await expect(body).toContainText('"method": "GET"');

    await body.click();
    await window.keyboard.press("Control+f");
    const input = window.getByTestId("response-filter-input").locator("input");
    await expect(input).toBeFocused();
    await expect(window.locator(".cm-search")).toHaveCount(0);

    await input.fill("$.query.page");
    await expect(body).toHaveText('[  "2"]');
    await expect(window.getByText("1 match", { exact: true })).toBeVisible();

    await input.fill("$.query[");
    await expect(window.getByTestId("response-filter-error")).toContainText(
      "Invalid JSONPath at position 9",
    );
    await expect(body).toContainText('"method": "GET"');

    await input.press("Escape");
    await expect(window.getByTestId("response-filter-input")).toHaveCount(0);
    await expect(body).toContainText('"method": "GET"');
  } finally {
    await echo.close();
  }
});

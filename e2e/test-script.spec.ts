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

// EP-10-T02, fluxo 4: uma request com script de teste anexado mostra o resultado da
// asserção depois de enviada (`useRequestTabsStore.dispatch` roda a fase `tests` do
// script depois da resposta chegar, `arch-docs/architecture.md` §4/§5).
test("runs a request's test script and shows the assertion result", async ({
  window,
  workspacesRoot,
}) => {
  const echo = await startEchoServer();

  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Scripts Workspace");
    await createCollection(window);
    await createRequest(window);
    await openRequestTab(window, "New request");

    await fillCodeMirror(window, requestUrlEditor(window), `${echo.url}/ping`);

    await window.getByRole("tab", { name: "Scripts" }).click();
    await window.getByRole("tab", { name: "Post-response" }).click();
    await fillCodeMirror(
      window,
      window.getByTestId("script-tests-editor"),
      'test("status is 200", () => expect(res.status).toBe(200));',
    );

    await sendActiveRequest(window);
    await waitForStatus(window, "200");

    await window.getByRole("tab", { name: "Tests" }).click();
    await expect(window.getByText("status is 200", { exact: true })).toBeVisible();
    await expect(window.getByText("1/1 passed")).toBeVisible();
  } finally {
    await echo.close();
  }
});

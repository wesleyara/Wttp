import { _electron as electron } from "@playwright/test";

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
  startEchoServer,
  waitForStatus,
  waitForTabSaved,
} from "./helpers";

// EP-10-T02, fluxo 1: criar workspace → criar request → enviar → salvar → fechar →
// reabrir e conferir que persistiu. "Fechar/reabrir" aqui é o app inteiro, não só a
// aba — é o teste mais forte de que o YAML foi de fato gravado em disco, não só
// mantido na store do renderer.
test("creates a request, sends it, saves it, and finds it again after reopening the app", async ({
  electronApp,
  window,
  userDataDir,
  workspacesRoot,
}) => {
  const echo = await startEchoServer();
  const requestUrl = `${echo.url}/hello`;

  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Persistence Workspace");

    await createCollection(window);
    await createRequest(window);
    await openRequestTab(window, "New request");

    await fillCodeMirror(window, requestUrlEditor(window), requestUrl);
    await sendActiveRequest(window);
    await waitForStatus(window, "200");

    await saveActiveTab(electronApp);
    await waitForTabSaved(window);
  } finally {
    await echo.close();
  }

  await electronApp.close();

  // Segunda instância do app, mesmo `userData`/workspaces-root — `workspace.init()`
  // reabre o workspace mais recente sozinho (`stores/workspace.ts`), sem precisar
  // clicar em nada.
  const reopened = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, "--headless=new", "--disable-gpu"],
    env: LAUNCH_ENV,
  });
  try {
    const page = await reopened.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    await openRequestTab(page, "New request");
    await expect(requestUrlEditor(page).locator(".cm-content")).toHaveText(requestUrl);
  } finally {
    await reopened.close();
  }
});

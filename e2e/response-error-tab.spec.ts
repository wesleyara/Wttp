import { createServer } from "node:net";

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
} from "./helpers";

/** Porta que acabou de ser liberada — conectar nela dá `CONNECTION_REFUSED` na hora. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

// Card 41 (ClickLocal): o erro de uma request ficava fixo acima de qualquer aba — dividia
// a tela com a lista do History e sobrevivia a "Limpar histórico". Agora é o conteúdo de
// uma aba própria, "Error".
test("shows a failed request in its own tab, not above the History tab", async ({
  window,
  workspacesRoot,
}) => {
  const port = await closedPort();

  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Error Tab Workspace");
  await createCollection(window);
  await createRequest(window);
  await openRequestTab(window, "New request");
  await fillCodeMirror(window, requestUrlEditor(window), `http://127.0.0.1:${port}/nope`);

  await sendActiveRequest(window);

  // A falha abre direto na aba Error.
  const errorTab = window.getByRole("tab", { name: /^Error/ });
  await expect(errorTab).toHaveAttribute("aria-selected", "true");
  await expect(window.getByText("CONNECTION_REFUSED", { exact: true })).toBeVisible();

  // History mostra só o histórico — nada do erro dividindo a tela com ele.
  await window.getByRole("tab", { name: /^History/ }).click();
  await expect(window.getByRole("button", { name: "Clear history" })).toBeVisible();
  await expect(window.getByText("CONNECTION_REFUSED", { exact: true })).toHaveCount(0);

  // Limpar o histórico deixa a aba vazia de verdade, sem erro preso nela.
  await window.getByRole("button", { name: "Clear history" }).click();
  await expect(window.getByText("No history yet")).toBeVisible();
  await expect(window.getByText("CONNECTION_REFUSED", { exact: true })).toHaveCount(0);

  // O erro desta sessão continua acessível na sua aba.
  await errorTab.click();
  await expect(window.getByText("CONNECTION_REFUSED", { exact: true })).toBeVisible();
});

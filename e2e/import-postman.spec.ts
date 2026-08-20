import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "./fixtures";
import { createWorkspace, fillCodeMirror, seedWorkspacesRoot } from "./helpers";

const FIXTURE_PATH = resolve(__dirname, "fixtures/e2e-collection.postman_collection.json");

// EP-10-T02, fluxo 3: importar uma collection do Postman para dentro de um workspace já
// aberto (EP-08-T07, item "Import" do menu "+"). O conteúdo é colado no editor em vez de
// escolhido por um diálogo nativo de arquivo — Playwright não automatiza o seletor de
// arquivo do SO — o mesmo caminho que "or paste content below" (`ImportModal.vue`) já
// oferece ao usuário.
test("imports a Postman collection into the open workspace's tree", async ({
  window,
  workspacesRoot,
}) => {
  const collectionJson = readFileSync(FIXTURE_PATH, "utf8");

  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Import Workspace");

  await window.getByTitle("New…").click();
  await window.getByRole("menuitem", { name: "Import" }).click();

  await fillCodeMirror(window, window.getByTestId("import-content-editor"), collectionJson);
  await expect(window.getByText("Format not recognized")).toHaveCount(0);

  await window.getByRole("button", { name: "Next", exact: true }).click();
  await window.getByRole("button", { name: "Import", exact: true }).click();

  await expect(window.getByText("Everything converted")).toBeVisible();
  await window.getByRole("button", { name: "Done", exact: true }).click();

  // A collection importada ("E2E Import Collection") vira uma pasta na raiz, e a
  // request de dentro ("Get status") aparece ao expandir (o botão-seta da linha, não
  // um clique na linha — clique simples numa pasta abre a aba de configuração dela).
  const collectionRow = window.getByRole("treeitem").filter({ hasText: "E2E Import Collection" });
  await expect(collectionRow).toBeVisible();
  await collectionRow.locator("button").first().click();
  await expect(window.getByRole("treeitem").filter({ hasText: "Get status" })).toBeVisible();
});

import { expect, test } from "./fixtures";
import {
  createCollection,
  createRequest,
  createWorkspace,
  fillCodeMirror,
  openRequestTab,
  requestUrlEditor,
  seedWorkspacesRoot,
} from "./helpers";

// Card #46 (ClickLocal): "Generate code" no menu de contexto da árvore — troca de
// linguagem, prévia com o snippet e a linguagem escolhida lembrada na reabertura.
test("generates a snippet in another language and remembers the choice", async ({
  window,
  workspacesRoot,
}) => {
  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Codegen Workspace");
  await createCollection(window);
  await createRequest(window);
  await openRequestTab(window, "New request");
  await fillCodeMirror(window, requestUrlEditor(window), "https://api.example.com/users?page=2");

  const row = window.getByRole("treeitem", { name: /New request/ });
  await row.click({ button: "right" });
  await window.getByRole("menuitem", { name: "Generate code…" }).click();

  const preview = window.getByTestId("codegen-preview").locator(".cm-content");
  await expect(preview).toContainText("curl --location");

  await window.getByTestId("codegen-language").locator("select").selectOption("python");
  await expect(preview).toContainText("requests.request(");
  await expect(preview).toContainText("https://api.example.com/users?page=2");

  await window.getByTestId("codegen-language").locator("select").selectOption("go");
  await expect(preview).toContainText("http.NewRequest");

  // Reabre: a última linguagem continua selecionada.
  await window.keyboard.press("Escape");
  await row.click({ button: "right" });
  await window.getByRole("menuitem", { name: "Generate code…" }).click();
  await expect(window.getByTestId("codegen-language").locator("select")).toHaveValue("go");
  await expect(preview).toContainText("http.NewRequest");
});

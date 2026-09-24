import { expect, test } from "./fixtures";
import { createWorkspace, seedWorkspacesRoot } from "./helpers";

// EP-08.1-T06/T07: trocar o idioma nas Preferências troca a UI na hora, e a
// documentação empacotada abre numa janela própria, sem rede.
test("switches the UI language and opens the bundled docs window", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Language demo");

  await expect(window.getByText("No collections yet")).toBeVisible();

  await window.getByTitle("Preferences").click();
  const dialog = window.getByRole("dialog");
  await dialog.locator("select").nth(1).selectOption("pt-BR");

  // Sem reiniciar: a árvore vazia atrás do modal já está em português.
  await expect(window.getByText("Nenhuma collection ainda")).toBeVisible();
  await expect(dialog.getByText("Idioma", { exact: true })).toBeVisible();

  // Card #60: a doc embutida segue o tema do app, não o do SO.
  await dialog.locator("select").nth(0).selectOption("dark");

  await dialog.getByRole("tab", { name: "Sobre" }).click();
  const [docs] = await Promise.all([
    electronApp.waitForEvent("window"),
    dialog.getByRole("button", { name: "Abrir docs embutida" }).click(),
  ]);
  await docs.waitForLoadState("domcontentloaded");

  expect(docs.url()).toMatch(/^wttp-docs:\/\/app\//);
  await expect(docs.getByText("Cliente HTTP local e open source").first()).toBeVisible();

  // Navegação interna pelo protocolo (URL limpa → `.html`, assets com base `/`).
  await docs.getByRole("link", { name: "Começar" }).click();
  await expect(docs.getByRole("heading", { name: "Instalação" }).first()).toBeVisible();

  // Tema do app (escuro), sem o seletor de tema do próprio VitePress; busca em português.
  await expect(docs.locator("html")).toHaveClass(/\bdark\b/);
  await expect(docs.locator(".VPSwitchAppearance")).toHaveCount(0);
  await expect(docs.getByRole("button", { name: "Buscar na documentação" })).toContainText(
    "Buscar",
  );

  // Trocar o tema nas Preferências com a doc aberta reflete na hora.
  await dialog.getByRole("tab", { name: "Geral" }).click();
  await dialog.locator("select").nth(0).selectOption("light");
  await expect(docs.locator("html")).not.toHaveClass(/\bdark\b/);
});

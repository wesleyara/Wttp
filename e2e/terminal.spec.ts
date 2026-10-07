import { expect, test } from "./fixtures";
import { createWorkspace, seedWorkspacesRoot } from "./helpers";

// ClickLocal #169: terminal embutido — um shell real (pty) na pasta do workspace.
test("runs commands in an embedded terminal rooted at the workspace", async ({
  window,
  workspacesRoot,
}) => {
  // /bin/sh: o teste não pode depender do zsh/oh-my-zsh de quem roda (que descarta o que
  // é digitado enquanto carrega o prompt). Também exercita a preferência do shell.
  await window.evaluate(() => window.wttp.settings.set({ terminalShell: "/bin/sh" }));
  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Terminal Test");

  await window.getByTestId("open-terminal").click();
  const panel = window.getByTestId("terminal-panel");
  await expect(panel).toBeVisible();

  const screen = panel.locator(".xterm-rows");
  await expect(screen).toBeVisible();
  await window.keyboard.type("echo wttp-$((1+2)) && pwd");
  await window.keyboard.press("Enter");
  await expect(screen).toContainText("wttp-3");

  // Ctrl+C chega ao shell (SIGINT) em vez de ser engolido pelo menu "Copy".
  await window.keyboard.type("sleep 30");
  await window.keyboard.press("Enter");
  await window.keyboard.press("Control+C");
  await window.keyboard.type("echo back-$((2+2))");
  await window.keyboard.press("Enter");
  await expect(screen).toContainText("back-4");

  // Fechar o shell mostra o código de saída na aba, sem derrubar o painel.
  await window.keyboard.type("exit 7");
  await window.keyboard.press("Enter");
  await expect(panel.getByRole("tab")).toContainText("exited 7");

  // Nova aba abre outro shell.
  await panel.getByTestId("terminal-new-tab").click();
  await expect(panel.getByRole("tab")).toHaveCount(2);
});

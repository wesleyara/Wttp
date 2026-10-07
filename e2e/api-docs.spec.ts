import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test } from "./fixtures";
import {
  createCollection,
  createRequest,
  createWorkspace,
  fillCodeMirror,
  openRequestTab,
  requestUrlEditor,
  saveActiveTab,
  seedWorkspacesRoot,
  waitForTabSaved,
} from "./helpers";

function findFile(dir: string, suffix: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".wttp" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, suffix);
      if (found) return found;
    } else if (entry.name.endsWith(suffix)) return full;
  }
  return null;
}

// EP-12: documentar a API onde ela é testada — editor com prévia lado a lado, o markdown
// gravado como bloco literal no YAML, e o painel de leitura da collection.
test("writes request docs with a live preview, persists them and reads the collection", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  const problems: string[] = [];
  window.on("console", message => {
    if (message.type() === "error") problems.push(message.text());
  });

  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Docs Workspace");
  await createCollection(window);
  await createRequest(window);
  await openRequestTab(window, "New request");
  await fillCodeMirror(window, requestUrlEditor(window), "https://api.example.com/users");

  await window.getByRole("tab", { name: "Docs" }).click();
  const editor = window.getByTestId("markdown-editor");
  await expect(editor).toBeVisible();

  await editor.locator(".cm-content").click();
  await window.keyboard.type(
    "# Users endpoint\n\nReturns **all** users.\n\n- one\ntwo\n\n```js\nconst a = 1;\n```\n\n```mermaid\nflowchart TD\n  A --> B\n```\n",
  );

  // Editor e prévia são abas (wrapper `markdown-editor-poc`): a prévia renderiza o mesmo texto.
  await editor.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = editor.locator(".md-editor-preview").first();
  await expect(preview.locator("h1")).toHaveText("Users endpoint");
  await expect(preview.locator("strong")).toHaveText("all");
  await expect(preview.locator("li")).toHaveCount(2);
  // Offline: highlight.js e mermaid empacotados, nada baixado de CDN sob a CSP.
  await expect(preview.locator("pre code .hljs-keyword, pre .hljs-keyword").first()).toBeVisible();
  await expect(preview.locator(".md-editor-mermaid svg").first()).toBeVisible({ timeout: 15000 });

  await window.screenshot({ path: "test-results/api-docs-editor.png" });
  await window.emulateMedia({ colorScheme: "dark" });
  await expect(window.locator("html")).toHaveClass(/dark/);
  await window.screenshot({ path: "test-results/api-docs-editor-dark.png" });
  await window.emulateMedia({ colorScheme: "light" });
  await expect(window.locator("html")).not.toHaveClass(/dark/);

  // Persistência: bloco literal legível no YAML.
  await saveActiveTab(electronApp);
  await waitForTabSaved(window);
  const file = findFile(workspacesRoot, ".req.yaml");
  expect(file).not.toBeNull();
  const yaml = readFileSync(file as string, "utf-8");
  expect(yaml).toMatch(/docs: \|-?\n {2}# Users endpoint\n\n {2}Returns \*\*all\*\* users\./);

  // Painel de leitura da collection.
  const collection = window.getByRole("treeitem").first();
  await collection.click({ button: "right" });
  await window.getByRole("menuitem", { name: "Read docs" }).click();

  const reader = window.getByTestId("docs-reader");
  await expect(reader).toBeVisible();
  // Método (badge) e URL são irmãos num flex: não há espaço de texto entre eles.
  await expect(reader.getByTestId("docs-signature")).toContainText("GET");
  await expect(reader.getByTestId("docs-signature")).toContainText("https://api.example.com/users");
  await expect(reader.getByTestId("docs-reader-content").locator("h1").first()).toBeVisible();
  await expect(reader).toContainText("Users endpoint");
  await expect(reader).toContainText("Not sent yet");
  await window.screenshot({ path: "test-results/api-docs-reader.png" });
  await window.emulateMedia({ colorScheme: "dark" });
  await expect(window.locator("html")).toHaveClass(/dark/);
  await window.screenshot({ path: "test-results/api-docs-reader-dark.png" });

  // A aba da request continua aberta ao lado — ler a doc não perde o estado das abas.
  await expect(window.getByRole("tab", { name: /New request/ })).toBeVisible();

  // Overview (#176): a request mostra o próprio body/seções só quando existem, e "Open request" leva à aba.
  await expect(reader.getByTestId("docs-body")).toHaveCount(0);
  await reader.getByTestId("docs-open-request").click();
  await expect(window.getByTestId("request-url-editor")).toBeVisible();

  // Reabrir o "Read docs" da mesma collection foca a aba existente — nunca abre outra.
  await collection.click({ button: "right" });
  await window.getByRole("menuitem", { name: "Read docs" }).click();
  await expect(window.getByTestId("docs-reader")).toBeVisible();
  await expect(window.getByRole("tab", { name: /New collection/ })).toHaveCount(1);

  expect(problems.filter(text => /Content Security Policy|Refused to/i.test(text))).toEqual([]);
});

// 1x1 PNG válido — o suficiente para o Chromium decodificar (`naturalWidth` 1).
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// Anexos de documentação: arquivo em `attachments/` (versionado), imagem carregando pelo
// protocolo `wttp-attachment:` sob a CSP, vídeo como <video>, e nada fora de attachments/ servido.
test("attaches an image and a video into the workspace and previews them", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Attach Workspace");
  await createCollection(window);
  await createRequest(window);
  await openRequestTab(window, "New request");

  const manifest = findFile(workspacesRoot, "wttp.yaml");
  expect(manifest).not.toBeNull();
  const root = dirname(manifest as string);

  const saved = await window.evaluate(
    async ({ root, png }) => {
      const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
      const image = await window.wttp.attachment.save({
        root,
        name: "Login Screen.PNG",
        data: bytes,
      });
      const video = await window.wttp.attachment.save({
        root,
        name: "demo.mp4",
        data: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]),
      });
      return { image, video };
    },
    { root, png: PNG_1X1 },
  );
  expect(saved.image.path).toMatch(/^attachments\/login-screen-[0-9a-f]{8}\.png$/);
  expect(saved.image.kind).toBe("image");
  expect(saved.video.kind).toBe("video");
  // No disco do workspace, ao lado dos YAMLs — é isso que o git versiona.
  expect(readFileSync(join(root, saved.image.path)).length).toBeGreaterThan(0);

  await window.getByRole("tab", { name: "Docs" }).click();
  const editor = window.getByTestId("markdown-editor");
  await editor.locator(".cm-content").click();
  await window.keyboard.type(`![login](${saved.image.path})\n\n![demo](${saved.video.path})\n`);

  // Plugins da toolbar (wrapper `markdown-editor-poc`): todos no menu "More tools".
  await editor.getByRole("button", { name: "More tools" }).click();
  for (const name of [
    "Callouts",
    "Date and time",
    "Emoji",
    "Templates",
    "Letter case",
    "Copy markdown",
  ]) {
    await expect(window.getByRole("menuitem", { name })).toBeVisible();
  }
  await window.keyboard.press("Escape");
  // Anexar imagem ou vídeo (diálogo nativo) mora na toolbar.
  await expect(editor.getByRole("button", { name: "Attach image or video" })).toBeVisible();

  await editor.getByRole("button", { name: "Preview", exact: true }).click();

  const preview = editor.locator(".md-editor-preview").first();
  const image = preview.locator("img").first();
  await expect(image).toHaveAttribute(
    "src",
    /^wttp-attachment:\/\/workspace\/attachments\/login-screen-/,
  );
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(1);

  const video = preview.locator("video");
  await expect(video).toHaveAttribute("src", /^wttp-attachment:\/\/workspace\/attachments\/demo-/);
  await expect(video).toHaveAttribute("controls", "");

  // O protocolo serve só attachments/: YAML do workspace, segredos e `../` dão 404.
  const statuses = await electronApp.evaluate(
    async ({ net }, paths) => {
      const out: Record<string, number> = {};
      for (const path of paths) {
        out[path] = (await net.fetch(`wttp-attachment://workspace/${path}`)).status;
      }
      return out;
    },
    [
      saved.image.path,
      "wttp.yaml",
      ".wttp/secrets.json",
      "attachments/../wttp.yaml",
      "attachments/nope-00000000.png",
    ],
  );
  expect(statuses[saved.image.path]).toBe(200);
  expect(statuses["wttp.yaml"]).toBe(404);
  expect(statuses[".wttp/secrets.json"]).toBe(404);
  expect(statuses["attachments/../wttp.yaml"]).toBe(404);
  expect(statuses["attachments/nope-00000000.png"]).toBe(404);

  await window.screenshot({ path: "test-results/api-docs-attachments.png" });
});

// Limpeza de anexos não usados: uma referência removida nunca apaga o arquivo; o aviso ao
// salvar leva a um diálogo, e só o que o usuário confirma sai de attachments/.
test("reviews and removes unused attachments, never the ones docs still mention", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  await seedWorkspacesRoot(window, workspacesRoot);
  await createWorkspace(window, "Cleanup Workspace");
  await createCollection(window);
  await createRequest(window);
  await openRequestTab(window, "New request");

  const manifest = findFile(workspacesRoot, "wttp.yaml");
  const root = dirname(manifest as string);
  // A varredura "base" (órfãos que já existiam ficam em silêncio) roda 800 ms depois do último
  // refresh da árvore — espera ela passar antes de anexar, senão os anexos novos entrariam nela.
  await window.waitForTimeout(1500);
  const { used, orphan } = await window.evaluate(
    async ({ root, png }) => {
      const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
      const used = await window.wttp.attachment.save({ root, name: "used.png", data: bytes });
      // Conteúdo diferente → outro hash → outro arquivo.
      const other = new Uint8Array([...bytes, 0]);
      const orphan = await window.wttp.attachment.save({ root, name: "orphan.png", data: other });
      return { used, orphan };
    },
    { root, png: PNG_1X1 },
  );

  await window.getByRole("tab", { name: "Docs" }).click();
  const editor = window.getByTestId("markdown-editor");
  await editor.locator(".cm-content").click();
  await window.keyboard.type(`![a](${used.path})\n![b](${orphan.path})\n`);

  // Aba suja (ainda não salva) também protege o anexo: nada para limpar.
  await window.getByTestId("open-attachments-cleanup").click();
  const dialog = window.getByTestId("unused-attachments");
  await expect(dialog).toContainText("No unused attachments.");
  await window.keyboard.press("Escape");

  // Tira a referência ao segundo e salva: ele fica sem uso e o app avisa.
  await editor.locator(".cm-content").click();
  await window.keyboard.press("Control+A");
  await window.keyboard.type(`![a](${used.path})\n`);
  await saveActiveTab(electronApp);
  await waitForTabSaved(window);

  await window.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dialog).toContainText(orphan.path.split("/")[1]);
  await expect(dialog).not.toContainText(used.path.split("/")[1]);

  await window.getByRole("button", { name: "Move to trash" }).click();
  // Sem lixeira neste ambiente o main apaga de vez e avisa; com lixeira, vai para ela — nos dois casos sai da pasta.
  await expect.poll(() => existsSync(join(root, orphan.path))).toBe(false);
  expect(existsSync(join(root, used.path))).toBe(true);
  await expect(dialog).toContainText("No unused attachments.");

  await window.screenshot({ path: "test-results/api-docs-cleanup.png" });
});

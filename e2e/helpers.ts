import type { ElectronApplication, Locator, Page } from "@playwright/test";

import { expect } from "@playwright/test";
import { createServer, type Server } from "node:http";

/**
 * Aponta `settings.workspacesRootDir` para uma pasta de teste via IPC direto
 * (`window.wttp.settings.set`), sem passar pelo diálogo nativo de pasta — Playwright
 * não consegue automatizar o seletor de arquivos do SO. `page.reload()` refaz o
 * bootstrap do `main.ts` (`useSettingsStore().load()`), a única forma de o app pegar o
 * valor persistido sem reiniciar o processo inteiro.
 */
export async function seedWorkspacesRoot(page: Page, dir: string): Promise<void> {
  await page.evaluate(async rootDir => {
    await (
      window as unknown as { wttp: { settings: { set: (p: object) => Promise<unknown> } } }
    ).wttp.settings.set({ workspacesRootDir: rootDir });
  }, dir);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Digita em um `WCodeEditor` (CodeMirror 6) — `insertText` evita o keymap de
 * auto-close de colchetes/aspas que digitar tecla a tecla dispararia em JSON/JS.
 * `WCodeEditor` só emite `update:modelValue` (o `v-model` que a store lê) 300ms depois
 * da última mudança por padrão (`debounceMs`, `WCodeEditor.vue`) — sem esperar esse
 * prazo, uma ação logo em seguida (ex. clicar Send) pode ler o valor antigo da store.
 */
export async function fillCodeMirror(page: Page, editor: Locator, text: string): Promise<void> {
  const content = editor.locator(".cm-content");
  await content.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  if (text) await page.keyboard.insertText(text);
  await page.waitForTimeout(350);
}

export async function createWorkspace(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await page.getByPlaceholder("Workspace name").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  // Toolbar da árvore só existe depois que `workspace.ready` vira `true`.
  await page.getByTitle("New…").waitFor();
}

async function openCreateMenu(page: Page): Promise<void> {
  await page.getByTitle("New…").click();
}

/**
 * Fecha a edição inline do nome logo após criar um nó, mantendo o nome padrão ("New
 * collection"/"New request") — `WTree.vue` só foca esse `WInput` depois de um
 * `nextTick()`; esperar o campo aparecer (em vez de mandar `Escape` para o que quer
 * que esteja focado no instante do clique) evita a corrida entre os dois.
 */
async function dismissInlineRename(page: Page, defaultName: string): Promise<void> {
  const input = page.getByRole("textbox").and(page.locator(`[value="${defaultName}"]`));
  await input.press("Escape");
}

/** "New collection" no menu "+" — sempre na raiz (única posição válida para uma collection). */
export async function createCollection(page: Page): Promise<void> {
  await openCreateMenu(page);
  await page.getByRole("menuitem", { name: "New collection" }).click();
  await dismissInlineRename(page, "New collection");
}

/** "New request" no menu "+" — cai dentro da collection selecionada (`defaultParentPath`, `stores/tree.ts`). */
export async function createRequest(page: Page): Promise<void> {
  await openCreateMenu(page);
  await page.getByRole("menuitem", { name: "New request" }).click();
  await dismissInlineRename(page, "New request");
}

/**
 * Abre a request clicando na linha da árvore (`activate(node, "preview")`,
 * `WTree.vue`) — clique único, não duplo clique: dois clientes fecham em cima de um
 * mesmo `await window.wttp.node.read(...)` ainda pendente dentro de `openTab`
 * (`stores/requestTabs.ts`), e cada um não vê a aba que o outro está prestes a criar —
 * gera duas abas para a mesma request. Um clique evita a corrida por completo.
 */
export async function openRequestTab(page: Page, name: string): Promise<void> {
  await page.getByRole("treeitem").filter({ hasText: name }).click();
}

export function requestUrlEditor(page: Page): Locator {
  return page.getByTestId("request-url-editor");
}

export async function sendActiveRequest(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

/** Aguarda o badge de status (`WStatusBadge`) na aba Body do `ResponsePanel`. */
export async function waitForStatus(page: Page, status: string): Promise<void> {
  await expect(page.getByText(status, { exact: true }).first()).toBeVisible();
}

/**
 * Dispara `request:save` exatamente como o atalho nativo `CmdOrCtrl+S`
 * (`src/main/menu.ts`) — via `webContents.send`, no processo main, em vez de simular a
 * tecla: um acelerador de menu do Electron nem sempre reage de forma confiável a um
 * evento de teclado sintético do CDP num Chromium headless.
 */
export async function saveActiveTab(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("menu:action", "request:save");
  });
}

/** A bolinha de "não salvo" (`tab.dirty`, `RequestTabsBar.vue`) some da aba ativa. */
export async function waitForTabSaved(page: Page): Promise<void> {
  await expect(page.locator('[data-request-tab][aria-selected="true"] .bg-accent')).toHaveCount(0);
}

export interface EchoServer {
  server: Server;
  url: string;
  close: () => Promise<void>;
}

/** Servidor HTTP local (`127.0.0.1`) — ecoa método/URL/corpo em JSON, sem depender de rede externa (arch-docs/conventions.md §Testes). */
export function startEchoServer(): Promise<EchoServer> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            method: req.method,
            path: url.pathname,
            query: Object.fromEntries(url.searchParams),
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolvePromise({
        server,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise(res => server.close(() => res())),
      });
    });
  });
}

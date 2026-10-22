import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { TestWebSocketServer } from "../src/main/testing/webSocketServer";
import { expect, test } from "./fixtures";
import {
  createCollection,
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

// ClickLocal #476: request WebSocket de ponta a ponta no Electron de verdade — criar pelo
// menu, conectar num servidor local (handshake com Authorization e subprotocolo), trocar
// mensagens, filtrar o histórico, reconectar sozinho após uma queda e salvar o arquivo.
test("connects to a WebSocket server, exchanges messages, reconnects and saves", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  const server = new TestWebSocketServer();
  await server.start();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "WS Workspace");
    await createCollection(window);

    await window.getByTitle("New…").click();
    await window.getByRole("menuitem", { name: "New WebSocket" }).click();
    await window
      .getByRole("textbox")
      .and(window.locator('[value="New WebSocket"]'))
      .press("Escape");
    await openRequestTab(window, "New WebSocket");

    await expect(window.getByTestId("websocket-url-bar")).toBeVisible();
    await fillCodeMirror(window, requestUrlEditor(window), server.url);

    // Connection: subprotocolo + reconexão automática.
    await window.getByRole("tab", { name: "Connection" }).click();
    await window.getByPlaceholder("chat, superchat").fill("chat");
    await window.getByTestId("websocket-reconnect-enabled").check();

    // Auth: bearer vira Authorization no handshake.
    await window.getByRole("tab", { name: "Auth" }).click();
    await window.getByRole("combobox").first().selectOption("bearer");
    const tokenEditor = window.locator(".cm-editor").filter({
      has: window.locator(".cm-placeholder", { hasText: "{{access_token}}" }),
    });
    await fillCodeMirror(window, tokenEditor, "s3cr3t");

    await window.getByTestId("websocket-toggle").click();
    await expect(window.getByTestId("websocket-state")).toContainText("Connected");
    expect(server.handshakes[0]["sec-websocket-protocol"]).toBe("chat");
    expect(server.handshakes[0].authorization).toBe("Bearer s3cr3t");

    // Enviar texto e receber o eco.
    await window.getByTestId("websocket-composer").fill("hello world");
    await window.getByTestId("websocket-send").click();
    await expect(
      window.getByTestId("websocket-entry-out").filter({ hasText: "hello world" }),
    ).toBeVisible();
    await expect(
      window.getByTestId("websocket-entry-in").filter({ hasText: "echo:hello world" }),
    ).toBeVisible();

    // JSON inválido bloqueia o envio; válido sai compacto.
    await window.getByTestId("websocket-format-json").click();
    await window.getByTestId("websocket-composer").fill("{ nope");
    await expect(window.getByTestId("websocket-send")).toBeDisabled();
    await window.getByTestId("websocket-composer").fill('{ "type": "ping" }');
    await window.getByTestId("websocket-send").click();
    await expect(
      window.getByTestId("websocket-entry-in").filter({ hasText: 'echo:{"type":"ping"}' }),
    ).toBeVisible();

    // Filtros.
    await window.getByTestId("websocket-filter-text").locator("input").fill("ping");
    await expect(window.getByTestId("websocket-entry-in")).toHaveCount(1);
    await window.getByTestId("websocket-filter-text").locator("input").fill("");
    await window.getByTestId("websocket-filter-out").click();
    await expect(window.getByTestId("websocket-entry-in")).toHaveCount(0);
    await window.getByTestId("websocket-filter-all").click();

    await window.screenshot({ path: "test-results/websocket-connected.png" });
    await window.emulateMedia({ colorScheme: "dark" });
    await expect(window.locator("html")).toHaveClass(/dark/);
    await window.screenshot({ path: "test-results/websocket-connected-dark.png" });
    await window.emulateMedia({ colorScheme: "light" });

    // Queda inesperada → reconecta sozinho.
    const before = server.handshakes.length;
    server.dropAll();
    await expect.poll(() => server.handshakes.length, { timeout: 15000 }).toBeGreaterThan(before);
    await expect(window.getByTestId("websocket-state")).toContainText("Connected");

    // Desconectar pelo botão nunca reconecta.
    const afterReconnect = server.handshakes.length;
    await window.getByTestId("websocket-toggle").click();
    await expect(window.getByTestId("websocket-state")).toContainText("Disconnected");
    await window.waitForTimeout(1500);
    expect(server.handshakes.length).toBe(afterReconnect);

    // Persistência no formato do §10.
    await saveActiveTab(electronApp);
    await waitForTabSaved(window);
    const file = findFile(workspacesRoot, ".req.yaml");
    expect(file).not.toBeNull();
    const yaml = readFileSync(file as string, "utf-8");
    expect(yaml).toContain("protocol: websocket");
    expect(yaml).toContain("subprotocols:\n    - chat");
    expect(yaml).toMatch(/reconnect:\n {4}enabled: true/);
    expect(yaml).toContain("content: ");
  } finally {
    await server.stop();
  }
});

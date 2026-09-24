import { app, BrowserWindow, protocol, shell } from "electron";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { isAllowedExternalUrl } from "../ipc/externalUrls";
import { resolveDocsFile } from "./docsPaths";

/**
 * Documentação empacotada (EP-08.1-T07) — o build estático do VitePress
 * (`yarn docs:build:offline`, base `/`) vive em `resources/docs-site` e é servido por um
 * protocolo próprio, não por `file://`: o VitePress usa caminhos absolutos e roteamento
 * de cliente, que `file://` quebra. Sem rede, sem servidor local, sem porta aberta.
 */
export const DOCS_SCHEME = "wttp-docs";
const DOCS_HOST = "app";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/** Precisa rodar antes de `app.whenReady()` — esquemas privilegiados não podem ser registrados depois. */
export function registerDocsScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: DOCS_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/**
 * O bundle do main fica em `out/main/index.js` tanto em dev/E2E quanto dentro do
 * `app.asar` — dois níveis acima está a raiz do app, onde `resources/` vive nos dois
 * casos. (`app.getAppPath()` não serve: aponta para `out/main` fora do pacote.)
 */
export function docsRootDir(): string {
  return join(__dirname, "..", "..", "resources", "docs-site");
}

let protocolRegistered = false;

function registerDocsProtocol(): void {
  if (protocolRegistered) return;
  protocolRegistered = true;
  protocol.handle(DOCS_SCHEME, async request => {
    const url = new URL(request.url);
    const file = url.host === DOCS_HOST ? resolveDocsFile(docsRootDir(), url.pathname) : null;
    if (!file) return new Response("Not found", { status: 404 });
    const body = await readFile(file);
    const type = MIME_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    return new Response(new Uint8Array(body), { headers: { "content-type": type } });
  });
}

/** `yarn dev` sobe o VitePress e aponta para ele (`scripts/dev.mjs`); nunca setado num app empacotado. */
function docsDevServerUrl(): string | null {
  const url = process.env["WTTP_DOCS_DEV_URL"];
  return !app.isPackaged && url ? url.replace(/\/+$/, "") : null;
}

export function docsAvailable(): boolean {
  return docsDevServerUrl() !== null || existsSync(join(docsRootDir(), "index.html"));
}

let docsWindow: BrowserWindow | null = null;

export function openDocsWindow(locale: "en" | "pt-BR"): void {
  registerDocsProtocol();
  const devServer = docsDevServerUrl();
  const origin = devServer ?? `${DOCS_SCHEME}://${DOCS_HOST}`;
  const target = `${origin}/${locale === "en" ? "en/" : ""}`;

  if (docsWindow && !docsWindow.isDestroyed()) {
    void docsWindow.loadURL(target);
    docsWindow.focus();
    return;
  }

  docsWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    title: "Wttp Docs",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  docsWindow.on("closed", () => (docsWindow = null));

  // Links externos (GitHub, etc.) abrem no browser do SO, nunca navegam esta janela; só a
  // própria documentação empacotada carrega aqui.
  docsWindow.webContents.setWindowOpenHandler(details => {
    if (isAllowedExternalUrl(details.url)) void shell.openExternal(details.url);
    return { action: "deny" };
  });
  docsWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${origin}/`)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  });

  void docsWindow.loadURL(target);
}

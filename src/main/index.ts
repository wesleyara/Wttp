import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, Menu, shell } from "electron";
import { join } from "path";

import icon from "../../resources/icon.png?asset";
import { registerIpcHandlers } from "./ipc";
import { buildMenu } from "./menu";
import { loadWindowState, watchWindowState } from "./window/windowState";

async function createWindow(): Promise<void> {
  const state = await loadWindowState();

  const mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: "Wttp",
    ...(process.platform === "linux" ? { icon } : {}),
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Chromium's built-in PDF viewer, used by the response panel's preview tab
      // (EP-03-T07) to render a `blob:` URL — it's Chromium's PDFium plugin, not a
      // browser plugin/NPAPI risk.
      plugins: true,
    },
  });

  if (state.isMaximized) mainWindow.maximize();
  watchWindowState(mainWindow);

  Menu.setApplicationMenu(buildMenu(mainWindow));

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  // Nothing inside the window ever navigates to a remote origin: external links
  // open in the user's browser.
  mainWindow.webContents.setWindowOpenHandler(details => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // Electron shows no native context menu on right-click by default — every text
  // field/editor in the app (including read-only ones like the response body
  // viewer) needs this to offer Copy/Cut/Paste/Select All.
  mainWindow.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable && params.selectionText.trim() === "") return;

    Menu.buildFromTemplate([
      { role: "cut", visible: params.isEditable, enabled: params.editFlags.canCut },
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", visible: params.isEditable, enabled: params.editFlags.canPaste },
      { type: "separator", visible: params.isEditable },
      { role: "selectAll", enabled: params.editFlags.canSelectAll },
    ]).popup();
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.wttp.app");

  // F12 toggles the devtools in development; Ctrl/Cmd+R is ignored in production.
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();

  void createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

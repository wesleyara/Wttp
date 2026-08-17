import type { MenuAction } from "@shared";

import { app, type BrowserWindow, Menu, type MenuItemConstructorOptions, shell } from "electron";

/** Envia a ação para o renderer decidir o que fazer — o main nunca conhece a UI. */
function send(win: BrowserWindow, action: MenuAction): void {
  win.webContents.send("menu:action", action);
}

export function buildMenu(win: BrowserWindow): Menu {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Request",
          accelerator: "CmdOrCtrl+N",
          click: () => send(win, "request:new"),
        },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => send(win, "request:save"),
        },
        { type: "separator" },
        {
          label: "Send Request",
          accelerator: "CmdOrCtrl+Return",
          click: () => send(win, "request:send"),
        },
        { type: "separator" },
        {
          label: "Close Tab",
          accelerator: "CmdOrCtrl+W",
          click: () => send(win, "tab:close"),
        },
        {
          label: "Next Tab",
          accelerator: "CmdOrCtrl+Tab",
          click: () => send(win, "tab:next"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find",
          accelerator: "CmdOrCtrl+F",
          click: () => send(win, "search:focus"),
        },
        {
          label: "Quick Open",
          accelerator: "CmdOrCtrl+P",
          click: () => send(win, "search:quickOpen"),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Report an Issue",
          click: () => void shell.openExternal(ISSUES_URL),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

// `package.json#homepage` do projeto — não uma URL digitada pelo usuário.
const ISSUES_URL = "https://github.com/wesleyara/Wttp/issues";

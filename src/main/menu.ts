import type { AppSettings, MenuAction } from "@shared";

import { app, type BrowserWindow, Menu, type MenuItemConstructorOptions, shell } from "electron";

import { resolveDocsLocale } from "./docs/docsLocale";
import { docsAvailable, openDocsWindow } from "./docs/docsWindow";

/** Envia a ação para o renderer decidir o que fazer — o main nunca conhece a UI. */
function send(win: BrowserWindow, action: MenuAction): void {
  win.webContents.send("menu:action", action);
}

/**
 * Acelerador padrão de cada `MenuAction` — única fonte da verdade, consumida por
 * `buildMenu` (abaixo) e exposta ao renderer via `menu:getDefaultAccelerators`
 * (card "Atalhos de teclado customizáveis") para a UI de Shortcuts saber o que
 * "Restore default" restaura, sem duplicar esta tabela lá.
 */
export const DEFAULT_ACCELERATORS: Record<MenuAction, string> = {
  "preferences:open": "CmdOrCtrl+,",
  "request:new": "CmdOrCtrl+N",
  "request:save": "CmdOrCtrl+S",
  "request:send": "CmdOrCtrl+Return",
  "tab:close": "CmdOrCtrl+W",
  "tab:next": "CmdOrCtrl+Tab",
  "search:focus": "CmdOrCtrl+F",
  "search:quickOpen": "CmdOrCtrl+P",
  "git:changes": "CmdOrCtrl+Shift+G",
};

/**
 * Ação que hoje usa este acelerador (padrão ou remapeado), se houver — usado pela UI
 * de Shortcuts para recusar uma combinação já ocupada por outra ação antes de salvar.
 * `excluding` deixa a própria ação sendo editada fora da checagem.
 */
export function findAcceleratorOwner(
  accelerator: string,
  shortcuts: Partial<Record<MenuAction, string>>,
  excluding?: MenuAction,
): MenuAction | null {
  const actions = Object.keys(DEFAULT_ACCELERATORS) as MenuAction[];
  const owner = actions.find(action => {
    if (action === excluding) return false;
    const effective = shortcuts[action] ?? DEFAULT_ACCELERATORS[action];
    return effective === accelerator;
  });
  return owner ?? null;
}

export function buildMenu(
  win: BrowserWindow,
  shortcuts: Partial<Record<MenuAction, string>> = {},
  language?: AppSettings["language"],
): Menu {
  const isMac = process.platform === "darwin";
  const accel = (action: MenuAction): string => shortcuts[action] ?? DEFAULT_ACCELERATORS[action];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Preferences…",
                accelerator: accel("preferences:open"),
                click: () => send(win, "preferences:open"),
              },
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
          accelerator: accel("request:new"),
          click: () => send(win, "request:new"),
        },
        {
          label: "Save",
          accelerator: accel("request:save"),
          click: () => send(win, "request:save"),
        },
        { type: "separator" },
        {
          label: "Send Request",
          accelerator: accel("request:send"),
          click: () => send(win, "request:send"),
        },
        { type: "separator" },
        {
          label: "Close Tab",
          accelerator: accel("tab:close"),
          click: () => send(win, "tab:close"),
        },
        {
          label: "Next Tab",
          accelerator: accel("tab:next"),
          click: () => send(win, "tab:next"),
        },
        ...(isMac
          ? []
          : ([
              { type: "separator" },
              {
                label: "Preferences…",
                accelerator: accel("preferences:open"),
                click: () => send(win, "preferences:open"),
              },
            ] satisfies MenuItemConstructorOptions[])),
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
          accelerator: accel("search:focus"),
          click: () => send(win, "search:focus"),
        },
        {
          label: "Quick Open",
          accelerator: accel("search:quickOpen"),
          click: () => send(win, "search:quickOpen"),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Changes",
          accelerator: accel("git:changes"),
          click: () => send(win, "git:changes"),
        },
        { type: "separator" },
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
          label: "Documentation",
          click: () => {
            const locale = resolveDocsLocale(language, app.getLocale());
            // Empacotada quando existe (funciona offline); senão, o site publicado.
            if (docsAvailable()) openDocsWindow(locale);
            else void shell.openExternal(DOCS_SITE_URL + (locale === "en" ? "/en/" : "/"));
          },
        },
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
const DOCS_SITE_URL = "https://wesleyara.github.io/Wttp";

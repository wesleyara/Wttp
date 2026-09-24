import type { AppSettings } from "@shared";

import { BrowserWindow, Menu, nativeTheme } from "electron";

import { appDataDir } from "../config/appDataDir";
import { readJsonFile, writeJsonFile } from "../config/jsonFile";
import { buildMenu } from "../menu";
import { registerHandler } from "./registry";

const FILE = "settings.json";

const DEFAULT_SETTINGS: AppSettings = { theme: "system", autoUpdateEnabled: true };

/**
 * Tema do app também no nível do Chromium (ClickLocal #60): `nativeTheme.themeSource` é
 * o `prefers-color-scheme` de toda janela — a doc embutida (VitePress em `force-auto`)
 * segue o tema das Preferências por aqui, e controles nativos (scrollbar, `<select>`)
 * deixam de destoar quando o app e o SO estão em temas diferentes. O renderer principal
 * continua resolvendo `dark`/`light`/`system` sozinho (`stores/settings.ts`).
 */
export function applyNativeTheme(theme: AppSettings["theme"]): void {
  nativeTheme.themeSource = theme;
}

/** Lida no bootstrap (`index.ts`), para o menu já nascer com os aceleradores salvos, sem esperar o primeiro `settings:get` do renderer. */
export function readSettings(): Promise<AppSettings> {
  return readJsonFile(appDataDir(), FILE, DEFAULT_SETTINGS);
}

export function registerSettingsHandlers(): void {
  registerHandler("settings:get", () => readSettings());

  registerHandler("settings:set", async patch => {
    const dir = appDataDir();
    const current = await readJsonFile(dir, FILE, DEFAULT_SETTINGS);
    const next = { ...current, ...patch };
    await writeJsonFile(dir, FILE, next);
    applyNativeTheme(next.theme);

    // Atalho novo vale na hora, sem reiniciar (card "Atalhos de teclado
    // customizáveis") — reconstrói o menu de toda janela aberta com os aceleradores
    // atuais. Outros campos de `AppSettings` não afetam o menu; reconstruir de
    // qualquer forma é barato e mantém um único caminho, sem precisar comparar patch.
    for (const win of BrowserWindow.getAllWindows()) {
      Menu.setApplicationMenu(buildMenu(win, next.shortcuts ?? {}, next.language));
    }

    return next;
  });

  registerHandler("settings:reset", async () => {
    const dir = appDataDir();
    await writeJsonFile(dir, FILE, DEFAULT_SETTINGS);
    applyNativeTheme(DEFAULT_SETTINGS.theme);
    for (const win of BrowserWindow.getAllWindows()) {
      Menu.setApplicationMenu(buildMenu(win, {}));
    }
    return DEFAULT_SETTINGS;
  });
}

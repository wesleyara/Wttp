import type { AppSettings } from "@shared";

import { BrowserWindow, Menu } from "electron";

import { appDataDir } from "../config/appDataDir";
import { readJsonFile, writeJsonFile } from "../config/jsonFile";
import { buildMenu } from "../menu";
import { registerHandler } from "./registry";

const FILE = "settings.json";

const DEFAULT_SETTINGS: AppSettings = { theme: "system", autoUpdateEnabled: true };

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
    for (const win of BrowserWindow.getAllWindows()) {
      Menu.setApplicationMenu(buildMenu(win, {}));
    }
    return DEFAULT_SETTINGS;
  });
}

import type { AppSettings } from "@shared";

import { appDataDir } from "../config/appDataDir";
import { readJsonFile, writeJsonFile } from "../config/jsonFile";
import { registerHandler } from "./registry";

const FILE = "settings.json";

const DEFAULT_SETTINGS: AppSettings = { theme: "system" };

export function registerSettingsHandlers(): void {
  registerHandler("settings:get", () => readJsonFile(appDataDir(), FILE, DEFAULT_SETTINGS));

  registerHandler("settings:set", async patch => {
    const dir = appDataDir();
    const current = await readJsonFile(dir, FILE, DEFAULT_SETTINGS);
    const next = { ...current, ...patch };
    await writeJsonFile(dir, FILE, next);
    return next;
  });

  registerHandler("settings:reset", async () => {
    const dir = appDataDir();
    await writeJsonFile(dir, FILE, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  });
}

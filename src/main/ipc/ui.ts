import type { UiState } from "@shared";

import { appDataDir } from "../config/appDataDir";
import { readJsonFile, writeJsonFile } from "../config/jsonFile";
import { registerHandler } from "./registry";

const FILE = "ui-state.json";

const DEFAULT_UI_STATE: UiState = {
  sidebarWidth: 260,
  responsePanelSize: 420,
  responsePanelPosition: "side",
};

export function registerUiHandlers(): void {
  registerHandler("ui:getState", () => readJsonFile(appDataDir(), FILE, DEFAULT_UI_STATE));

  registerHandler("ui:setState", async patch => {
    const dir = appDataDir();
    const current = await readJsonFile(dir, FILE, DEFAULT_UI_STATE);
    const next = { ...current, ...patch };
    await writeJsonFile(dir, FILE, next);
    return next;
  });
}

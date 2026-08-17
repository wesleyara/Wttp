import type { AppInfo, AppSettings, UiState } from "@shared";

import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge } from "electron";

import { invoke } from "./ipc";

// Superfície exposta ao renderer. Métodos específicos, nunca `ipcRenderer` inteiro
// nem um `invoke(channel, ...)` genérico — isso reabriria a superfície que o
// contextBridge existe para fechar.
const wttp = {
  app: {
    ping: (): Promise<AppInfo> => invoke("app:ping"),
  },
  ui: {
    getState: (): Promise<UiState> => invoke("ui:getState"),
    setState: (patch: Partial<UiState>): Promise<UiState> => invoke("ui:setState", patch),
  },
  settings: {
    get: (): Promise<AppSettings> => invoke("settings:get"),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> => invoke("settings:set", patch),
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("wttp", wttp);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.wttp = wttp;
}

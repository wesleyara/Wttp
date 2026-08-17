import type { AppInfo, AppSettings, MenuAction, UiState } from "@shared";

import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";

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
  menu: {
    // Evento main → renderer, fora do `IpcContract` de invoke/result (ver @shared).
    // Devolve o `unsubscribe`, já que quem escuta normalmente é um componente Vue.
    onAction: (callback: (action: MenuAction) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, action: MenuAction): void =>
        callback(action);
      ipcRenderer.on("menu:action", listener);
      return () => ipcRenderer.off("menu:action", listener);
    },
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

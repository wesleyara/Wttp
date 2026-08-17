import type {
  AppInfo,
  AppSettings,
  CreateWorkspacePayload,
  FolderNode,
  HttpProgressEvent,
  HttpRequestSpec,
  HttpResponseResult,
  MenuAction,
  MoveNodePayload,
  NodePathPayload,
  OpenWorkspacePayload,
  RecentWorkspace,
  RequestNode,
  SaveFilePayload,
  SaveFileResult,
  SecretStorageStatus,
  UiState,
  WorkspaceChangedEvent,
  WorkspaceTree,
  WriteNodePayload,
} from "@shared";

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
  http: {
    send: (spec: HttpRequestSpec): Promise<HttpResponseResult> => invoke("http:send", spec),
    cancel: (requestId: string): Promise<void> => invoke("http:cancel", requestId),
    // Evento main → renderer, fora do `IpcContract` de invoke/result (ver @shared).
    onProgress: (callback: (event: HttpProgressEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: HttpProgressEvent): void =>
        callback(progress);
      ipcRenderer.on("http:progress", listener);
      return () => ipcRenderer.off("http:progress", listener);
    },
  },
  dialog: {
    saveFile: (payload: SaveFilePayload): Promise<SaveFileResult> =>
      invoke("dialog:saveFile", payload),
  },
  workspace: {
    open: (payload: OpenWorkspacePayload = {}): Promise<WorkspaceTree | null> =>
      invoke("workspace:open", payload),
    create: (payload: CreateWorkspacePayload): Promise<WorkspaceTree> =>
      invoke("workspace:create", payload),
    recent: (): Promise<RecentWorkspace[]> => invoke("workspace:recent"),
    // Evento main → renderer, fora do `IpcContract` de invoke/result (ver @shared).
    onChanged: (callback: (event: WorkspaceChangedEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, changed: WorkspaceChangedEvent): void =>
        callback(changed);
      ipcRenderer.on("workspace:changed", listener);
      return () => ipcRenderer.off("workspace:changed", listener);
    },
  },
  node: {
    read: (payload: NodePathPayload): Promise<FolderNode | RequestNode> =>
      invoke("node:read", payload),
    write: (payload: WriteNodePayload): Promise<void> => invoke("node:write", payload),
    move: (payload: MoveNodePayload): Promise<void> => invoke("node:move", payload),
    delete: (payload: NodePathPayload): Promise<void> => invoke("node:delete", payload),
  },
  secret: {
    get: (key: string): Promise<string | null> => invoke("secret:get", { key }),
    set: (key: string, value: string): Promise<void> => invoke("secret:set", { key, value }),
    delete: (key: string): Promise<void> => invoke("secret:delete", { key }),
    status: (): Promise<SecretStorageStatus> => invoke("secret:status"),
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

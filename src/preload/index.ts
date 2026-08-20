import type {
  AppendHistoryPayload,
  AppInfo,
  AppOpenExternalPayload,
  AppSettings,
  CopyNodeIntoPayload,
  CreateNodePayload,
  CreateWorkspacePayload,
  DetectImportPayload,
  DiscoveredWorkspace,
  EnvironmentListItem,
  EnvironmentPathPayload,
  FolderNode,
  HistoryEntry,
  HttpProgressEvent,
  HttpRequestSpec,
  HttpResponseResult,
  ImportFormat,
  ImportPreview,
  ImportReport,
  ListWorkspacesInDirPayload,
  MenuAction,
  MoveNodeIntoPayload,
  MoveNodePayload,
  NodePathPayload,
  OpenWorkspacePayload,
  ParseCurlPayload,
  ParsedCurlRequest,
  PickFilePayload,
  PickFileResult,
  PickFolderPayload,
  PickFolderResult,
  PreviewImportPayload,
  RecentWorkspace,
  RemoveRecentWorkspacePayload,
  RenameNodePayload,
  RequestHistoryPayload,
  RequestNode,
  ResolveAuthChainPayload,
  ResolveAuthChainResultPayload,
  ResolveRequestPayload,
  ResolveRequestResultPayload,
  ResolveTextPayload,
  ResolveTextResultPayload,
  RunImportPayload,
  SaveEnvironmentPayload,
  SaveFilePayload,
  SaveFileResult,
  ScriptRunResult,
  ScriptRunSpec,
  SecretStorageStatus,
  SetWorkspaceDraftsPayload,
  SetWorkspaceUiStatePayload,
  SetWorkspaceVariablesPayload,
  UiState,
  WorkspaceChangedEvent,
  WorkspaceDrafts,
  WorkspaceRootPayload,
  WorkspaceTree,
  WorkspaceUiState,
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
    openExternal: (payload: AppOpenExternalPayload): Promise<void> =>
      invoke("app:openExternal", payload),
  },
  ui: {
    getState: (): Promise<UiState> => invoke("ui:getState"),
    setState: (patch: Partial<UiState>): Promise<UiState> => invoke("ui:setState", patch),
  },
  settings: {
    get: (): Promise<AppSettings> => invoke("settings:get"),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> => invoke("settings:set", patch),
    reset: (): Promise<AppSettings> => invoke("settings:reset"),
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
    pickFolder: (payload: PickFolderPayload = {}): Promise<PickFolderResult> =>
      invoke("dialog:pickFolder", payload),
    pickFile: (payload: PickFilePayload = {}): Promise<PickFileResult> =>
      invoke("dialog:pickFile", payload),
  },
  workspace: {
    open: (payload: OpenWorkspacePayload = {}): Promise<WorkspaceTree | null> =>
      invoke("workspace:open", payload),
    create: (payload: CreateWorkspacePayload): Promise<WorkspaceTree> =>
      invoke("workspace:create", payload),
    recent: (): Promise<RecentWorkspace[]> => invoke("workspace:recent"),
    removeRecent: (payload: RemoveRecentWorkspacePayload): Promise<RecentWorkspace[]> =>
      invoke("workspace:removeRecent", payload),
    rescan: (payload: WorkspaceRootPayload): Promise<WorkspaceTree> =>
      invoke("workspace:rescan", payload),
    getUiState: (payload: WorkspaceRootPayload): Promise<WorkspaceUiState> =>
      invoke("workspace:getUiState", payload),
    setUiState: (payload: SetWorkspaceUiStatePayload): Promise<void> =>
      invoke("workspace:setUiState", payload),
    getDrafts: (payload: WorkspaceRootPayload): Promise<WorkspaceDrafts> =>
      invoke("workspace:getDrafts", payload),
    setDrafts: (payload: SetWorkspaceDraftsPayload): Promise<void> =>
      invoke("workspace:setDrafts", payload),
    setVariables: (payload: SetWorkspaceVariablesPayload): Promise<WorkspaceTree> =>
      invoke("workspace:setVariables", payload),
    listInDir: (payload: ListWorkspacesInDirPayload): Promise<DiscoveredWorkspace[]> =>
      invoke("workspace:listInDir", payload),
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
    create: (payload: CreateNodePayload): Promise<FolderNode | RequestNode> =>
      invoke("node:create", payload),
    rename: (payload: RenameNodePayload): Promise<FolderNode | RequestNode> =>
      invoke("node:rename", payload),
    duplicate: (payload: NodePathPayload): Promise<FolderNode | RequestNode> =>
      invoke("node:duplicate", payload),
    reveal: (payload: NodePathPayload): Promise<void> => invoke("node:reveal", payload),
    trash: (payload: NodePathPayload): Promise<void> => invoke("node:trash", payload),
    moveInto: (payload: MoveNodeIntoPayload): Promise<FolderNode | RequestNode> =>
      invoke("node:moveInto", payload),
    copyInto: (payload: CopyNodeIntoPayload): Promise<FolderNode | RequestNode> =>
      invoke("node:copyInto", payload),
  },
  secret: {
    get: (key: string): Promise<string | null> => invoke("secret:get", { key }),
    set: (key: string, value: string): Promise<void> => invoke("secret:set", { key, value }),
    delete: (key: string): Promise<void> => invoke("secret:delete", { key }),
    status: (): Promise<SecretStorageStatus> => invoke("secret:status"),
  },
  env: {
    list: (payload: WorkspaceRootPayload): Promise<EnvironmentListItem[]> =>
      invoke("env:list", payload),
    save: (payload: SaveEnvironmentPayload): Promise<EnvironmentListItem> =>
      invoke("env:save", payload),
    delete: (payload: EnvironmentPathPayload): Promise<void> => invoke("env:delete", payload),
    duplicate: (payload: EnvironmentPathPayload): Promise<EnvironmentListItem> =>
      invoke("env:duplicate", payload),
  },
  variables: {
    resolveText: (payload: ResolveTextPayload): Promise<ResolveTextResultPayload> =>
      invoke("variables:resolveText", payload),
    resolveRequest: (payload: ResolveRequestPayload): Promise<ResolveRequestResultPayload> =>
      invoke("variables:resolveRequest", payload),
    resolveAuthChain: (payload: ResolveAuthChainPayload): Promise<ResolveAuthChainResultPayload> =>
      invoke("variables:resolveAuthChain", payload),
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
  import: {
    detect: (payload: DetectImportPayload): Promise<ImportFormat | null> =>
      invoke("import:detect", payload),
    run: (payload: RunImportPayload): Promise<ImportReport> => invoke("import:run", payload),
    parseCurl: (payload: ParseCurlPayload): Promise<ParsedCurlRequest | null> =>
      invoke("import:parseCurl", payload),
    preview: (payload: PreviewImportPayload): Promise<ImportPreview> =>
      invoke("import:preview", payload),
  },
  script: {
    run: (payload: ScriptRunSpec): Promise<ScriptRunResult> => invoke("script:run", payload),
  },
  history: {
    list: (payload: RequestHistoryPayload): Promise<HistoryEntry[]> =>
      invoke("history:list", payload),
    append: (payload: AppendHistoryPayload): Promise<void> => invoke("history:append", payload),
    clear: (payload: RequestHistoryPayload): Promise<void> => invoke("history:clear", payload),
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

import type {
  AppendHistoryPayload,
  AppInfo,
  AppOpenDocsPayload,
  AppOpenExternalPayload,
  AppSettings,
  AttachmentInfo,
  CopyNodeIntoPayload,
  CreateFlowPayload,
  CreateNodePayload,
  CreateWorkspacePayload,
  DetectImportPayload,
  DiscoveredWorkspace,
  EnvironmentListItem,
  EnvironmentPathPayload,
  FlowEvent,
  FlowListItem,
  FlowPathPayload,
  FlowRunPayload,
  FlowRunResult,
  FolderNode,
  GitAheadBehind,
  GitBranches,
  GitChangesPayload,
  GitCheckoutPayload,
  GitCommitPayload,
  GitCommitResult,
  GitCreateBranchPayload,
  GitFileChange,
  GitFileVersions,
  GitFileVersionsPayload,
  GitInfo,
  GitLog,
  GitLogPayload,
  GitPathsPayload,
  GitPushPayload,
  GitRef,
  GitRemotePayload,
  GitRestorePayload,
  GitRootPayload,
  GitStatus,
  HistoryEntry,
  HttpProgressEvent,
  HttpRequestSpec,
  HttpResponseResult,
  ImportFormat,
  ImportPreview,
  ImportReport,
  ListAttachmentsPayload,
  ListWorkspacesInDirPayload,
  MenuAction,
  MoveNodeIntoPayload,
  MoveNodePayload,
  NodePathPayload,
  OpenWorkspacePayload,
  ParseCurlPayload,
  ParsedCurlRequest,
  PickAttachmentsPayload,
  PickAttachmentsResult,
  PickFilePayload,
  PickFileResult,
  PickFolderPayload,
  PickFolderResult,
  PreviewImportPayload,
  ReadAttachmentPayload,
  ReadAttachmentResult,
  RecentWorkspace,
  RemoveRecentWorkspacePayload,
  RenameFlowPayload,
  RenameNodePayload,
  RequestHistoryPayload,
  RequestNode,
  ResolveAuthChainPayload,
  ResolveAuthChainResultPayload,
  ResolveRequestPayload,
  ResolveRequestResultPayload,
  ResolveTextPayload,
  ResolveTextResultPayload,
  RunEvent,
  RunImportPayload,
  RunStartPayload,
  RunStartResult,
  SaveAttachmentPayload,
  SaveEnvironmentPayload,
  SaveFilePayload,
  SaveFileResult,
  SaveFlowPayload,
  ScriptRunResult,
  ScriptRunSpec,
  SecretStorageStatus,
  SetWorkspaceDraftsPayload,
  SetWorkspaceUiStatePayload,
  SetWorkspaceVariablesPayload,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalOpenPayload,
  TerminalResizePayload,
  TerminalSpawnPayload,
  TerminalWritePayload,
  TrashAttachmentsPayload,
  TrashAttachmentsResult,
  UiState,
  UpdateStatus,
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
    openDocs: (payload: AppOpenDocsPayload): Promise<void> => invoke("app:openDocs", payload),
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
  attachment: {
    save: (payload: SaveAttachmentPayload): Promise<AttachmentInfo> =>
      invoke("attachment:save", payload),
    pick: (payload: PickAttachmentsPayload): Promise<PickAttachmentsResult> =>
      invoke("attachment:pick", payload),
    read: (payload: ReadAttachmentPayload): Promise<ReadAttachmentResult> =>
      invoke("attachment:read", payload),
    list: (payload: ListAttachmentsPayload): Promise<AttachmentInfo[]> =>
      invoke("attachment:list", payload),
    trash: (payload: TrashAttachmentsPayload): Promise<TrashAttachmentsResult> =>
      invoke("attachment:trash", payload),
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
    getDefaultAccelerators: (): Promise<Record<MenuAction, string>> =>
      invoke("menu:getDefaultAccelerators"),
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
  terminal: {
    open: (payload: TerminalOpenPayload): Promise<void> => invoke("terminal:open", payload),
    spawn: (payload: TerminalSpawnPayload): Promise<{ id: number; shell: string }> =>
      invoke("terminal:spawn", payload),
    write: (payload: TerminalWritePayload): Promise<void> => invoke("terminal:write", payload),
    resize: (payload: TerminalResizePayload): Promise<void> => invoke("terminal:resize", payload),
    kill: (id: number): Promise<void> => invoke("terminal:kill", id),
    // Eventos main → renderer, fora do `IpcContract` de invoke/result (ver @shared).
    onData: (callback: (event: TerminalDataEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: TerminalDataEvent): void =>
        callback(data);
      ipcRenderer.on("terminal:data", listener);
      return () => ipcRenderer.off("terminal:data", listener);
    },
    onExit: (callback: (event: TerminalExitEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: TerminalExitEvent): void =>
        callback(data);
      ipcRenderer.on("terminal:exit", listener);
      return () => ipcRenderer.off("terminal:exit", listener);
    },
  },
  script: {
    run: (payload: ScriptRunSpec): Promise<ScriptRunResult> => invoke("script:run", payload),
  },
  git: {
    info: (payload: GitRootPayload): Promise<GitInfo> => invoke("git:info", payload),
    status: (payload: GitRootPayload): Promise<GitStatus> => invoke("git:status", payload),
    refs: (payload: GitRootPayload): Promise<GitRef[]> => invoke("git:refs", payload),
    changes: (payload: GitChangesPayload): Promise<GitFileChange[]> =>
      invoke("git:changes", payload),
    fileVersions: (payload: GitFileVersionsPayload): Promise<GitFileVersions> =>
      invoke("git:fileVersions", payload),
    log: (payload: GitLogPayload): Promise<GitLog> => invoke("git:log", payload),
    restore: (payload: GitRestorePayload): Promise<void> => invoke("git:restore", payload),
    stage: (payload: GitPathsPayload): Promise<void> => invoke("git:stage", payload),
    unstage: (payload: GitPathsPayload): Promise<void> => invoke("git:unstage", payload),
    discard: (payload: GitPathsPayload): Promise<void> => invoke("git:discard", payload),
    commit: (payload: GitCommitPayload): Promise<GitCommitResult> => invoke("git:commit", payload),
    init: (payload: GitRootPayload): Promise<void> => invoke("git:init", payload),
    branches: (payload: GitRootPayload): Promise<GitBranches> => invoke("git:branches", payload),
    checkout: (payload: GitCheckoutPayload): Promise<void> => invoke("git:checkout", payload),
    createBranch: (payload: GitCreateBranchPayload): Promise<void> =>
      invoke("git:createBranch", payload),
    aheadBehind: (payload: GitRootPayload): Promise<GitAheadBehind> =>
      invoke("git:aheadBehind", payload),
    fetch: (payload: GitRemotePayload): Promise<GitAheadBehind> => invoke("git:fetch", payload),
    pull: (payload: GitRemotePayload): Promise<GitAheadBehind> => invoke("git:pull", payload),
    push: (payload: GitPushPayload): Promise<GitAheadBehind> => invoke("git:push", payload),
    cancel: (operationId: string): Promise<void> => invoke("git:cancel", operationId),
  },
  runner: {
    start: (payload: RunStartPayload): Promise<RunStartResult> => invoke("runner:start", payload),
    stop: (runId: string): Promise<void> => invoke("runner:stop", runId),
    // Evento main → renderer, fora do `IpcContract` de invoke/result (ver @shared).
    onEvent: (callback: (event: RunEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, runEvent: RunEvent): void =>
        callback(runEvent);
      ipcRenderer.on("runner:event", listener);
      return () => ipcRenderer.off("runner:event", listener);
    },
  },
  flow: {
    create: (payload: CreateFlowPayload): Promise<FlowListItem> => invoke("flow:create", payload),
    save: (payload: SaveFlowPayload): Promise<FlowListItem> => invoke("flow:save", payload),
    rename: (payload: RenameFlowPayload): Promise<FlowListItem> => invoke("flow:rename", payload),
    delete: (payload: FlowPathPayload): Promise<void> => invoke("flow:delete", payload),
    run: (payload: FlowRunPayload): Promise<FlowRunResult> => invoke("flow:run", payload),
    stop: (runId: string): Promise<void> => invoke("flow:stop", runId),
    // Evento main → renderer, fora do `IpcContract` de invoke/result (ver @shared).
    onEvent: (callback: (event: FlowEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, flowEvent: FlowEvent): void =>
        callback(flowEvent);
      ipcRenderer.on("flow:event", listener);
      return () => ipcRenderer.off("flow:event", listener);
    },
  },
  history: {
    list: (payload: RequestHistoryPayload): Promise<HistoryEntry[]> =>
      invoke("history:list", payload),
    append: (payload: AppendHistoryPayload): Promise<void> => invoke("history:append", payload),
    clear: (payload: RequestHistoryPayload): Promise<void> => invoke("history:clear", payload),
  },
  update: {
    getStatus: (): Promise<UpdateStatus> => invoke("update:getStatus"),
    check: (): Promise<void> => invoke("update:check"),
    install: (): Promise<void> => invoke("update:install"),
    // Evento main → renderer, fora do `IpcContract` de invoke/result (ver @shared).
    onStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void =>
        callback(status);
      ipcRenderer.on("update:status", listener);
      return () => ipcRenderer.off("update:status", listener);
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

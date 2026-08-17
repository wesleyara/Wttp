import type { ElectronAPI } from "@electron-toolkit/preload";
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
  PickFolderResult,
  RecentWorkspace,
  RemoveRecentWorkspacePayload,
  RequestNode,
  SaveFilePayload,
  SaveFileResult,
  SecretStorageStatus,
  SetWorkspaceUiStatePayload,
  UiState,
  WorkspaceChangedEvent,
  WorkspaceRootPayload,
  WorkspaceTree,
  WorkspaceUiState,
  WriteNodePayload,
} from "@shared";

interface WttpApi {
  app: {
    ping: () => Promise<AppInfo>;
  };
  ui: {
    getState: () => Promise<UiState>;
    setState: (patch: Partial<UiState>) => Promise<UiState>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  };
  http: {
    send: (spec: HttpRequestSpec) => Promise<HttpResponseResult>;
    cancel: (requestId: string) => Promise<void>;
    onProgress: (callback: (event: HttpProgressEvent) => void) => () => void;
  };
  dialog: {
    saveFile: (payload: SaveFilePayload) => Promise<SaveFileResult>;
    pickFolder: () => Promise<PickFolderResult>;
  };
  workspace: {
    open: (payload?: OpenWorkspacePayload) => Promise<WorkspaceTree | null>;
    create: (payload: CreateWorkspacePayload) => Promise<WorkspaceTree>;
    recent: () => Promise<RecentWorkspace[]>;
    removeRecent: (payload: RemoveRecentWorkspacePayload) => Promise<RecentWorkspace[]>;
    getUiState: (payload: WorkspaceRootPayload) => Promise<WorkspaceUiState>;
    setUiState: (payload: SetWorkspaceUiStatePayload) => Promise<void>;
    onChanged: (callback: (event: WorkspaceChangedEvent) => void) => () => void;
  };
  node: {
    read: (payload: NodePathPayload) => Promise<FolderNode | RequestNode>;
    write: (payload: WriteNodePayload) => Promise<void>;
    move: (payload: MoveNodePayload) => Promise<void>;
    delete: (payload: NodePathPayload) => Promise<void>;
  };
  secret: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
    status: () => Promise<SecretStorageStatus>;
  };
  menu: {
    onAction: (callback: (action: MenuAction) => void) => () => void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    wttp: WttpApi;
  }
}

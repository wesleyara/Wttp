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
  RecentWorkspace,
  RequestNode,
  SaveFilePayload,
  SaveFileResult,
  UiState,
  WorkspaceTree,
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
  };
  workspace: {
    open: (payload?: OpenWorkspacePayload) => Promise<WorkspaceTree | null>;
    create: (payload: CreateWorkspacePayload) => Promise<WorkspaceTree>;
    recent: () => Promise<RecentWorkspace[]>;
  };
  node: {
    read: (payload: NodePathPayload) => Promise<FolderNode | RequestNode>;
    write: (payload: WriteNodePayload) => Promise<void>;
    move: (payload: MoveNodePayload) => Promise<void>;
    delete: (payload: NodePathPayload) => Promise<void>;
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

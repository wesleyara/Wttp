import type { ElectronAPI } from "@electron-toolkit/preload";
import type {
  AppInfo,
  AppSettings,
  CreateNodePayload,
  CreateWorkspacePayload,
  DetectImportPayload,
  DiscoveredWorkspace,
  EnvironmentListItem,
  EnvironmentPathPayload,
  FolderNode,
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
  SetWorkspaceUiStatePayload,
  SetWorkspaceVariablesPayload,
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
    pickFolder: (payload?: PickFolderPayload) => Promise<PickFolderResult>;
    pickFile: (payload?: PickFilePayload) => Promise<PickFileResult>;
  };
  workspace: {
    open: (payload?: OpenWorkspacePayload) => Promise<WorkspaceTree | null>;
    create: (payload: CreateWorkspacePayload) => Promise<WorkspaceTree>;
    recent: () => Promise<RecentWorkspace[]>;
    removeRecent: (payload: RemoveRecentWorkspacePayload) => Promise<RecentWorkspace[]>;
    rescan: (payload: WorkspaceRootPayload) => Promise<WorkspaceTree>;
    getUiState: (payload: WorkspaceRootPayload) => Promise<WorkspaceUiState>;
    setUiState: (payload: SetWorkspaceUiStatePayload) => Promise<void>;
    setVariables: (payload: SetWorkspaceVariablesPayload) => Promise<WorkspaceTree>;
    listInDir: (payload: ListWorkspacesInDirPayload) => Promise<DiscoveredWorkspace[]>;
    onChanged: (callback: (event: WorkspaceChangedEvent) => void) => () => void;
  };
  node: {
    read: (payload: NodePathPayload) => Promise<FolderNode | RequestNode>;
    write: (payload: WriteNodePayload) => Promise<void>;
    move: (payload: MoveNodePayload) => Promise<void>;
    delete: (payload: NodePathPayload) => Promise<void>;
    create: (payload: CreateNodePayload) => Promise<FolderNode | RequestNode>;
    rename: (payload: RenameNodePayload) => Promise<FolderNode | RequestNode>;
    duplicate: (payload: NodePathPayload) => Promise<FolderNode | RequestNode>;
    reveal: (payload: NodePathPayload) => Promise<void>;
    trash: (payload: NodePathPayload) => Promise<void>;
    moveInto: (payload: MoveNodeIntoPayload) => Promise<FolderNode | RequestNode>;
  };
  secret: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
    status: () => Promise<SecretStorageStatus>;
  };
  env: {
    list: (payload: WorkspaceRootPayload) => Promise<EnvironmentListItem[]>;
    save: (payload: SaveEnvironmentPayload) => Promise<EnvironmentListItem>;
    delete: (payload: EnvironmentPathPayload) => Promise<void>;
    duplicate: (payload: EnvironmentPathPayload) => Promise<EnvironmentListItem>;
  };
  variables: {
    resolveText: (payload: ResolveTextPayload) => Promise<ResolveTextResultPayload>;
    resolveRequest: (payload: ResolveRequestPayload) => Promise<ResolveRequestResultPayload>;
    resolveAuthChain: (payload: ResolveAuthChainPayload) => Promise<ResolveAuthChainResultPayload>;
  };
  menu: {
    onAction: (callback: (action: MenuAction) => void) => () => void;
  };
  import: {
    detect: (payload: DetectImportPayload) => Promise<ImportFormat | null>;
    run: (payload: RunImportPayload) => Promise<ImportReport>;
    parseCurl: (payload: ParseCurlPayload) => Promise<ParsedCurlRequest | null>;
    preview: (payload: PreviewImportPayload) => Promise<ImportPreview>;
  };
  script: {
    run: (payload: ScriptRunSpec) => Promise<ScriptRunResult>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    wttp: WttpApi;
  }
}

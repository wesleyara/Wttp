import type { ElectronAPI } from "@electron-toolkit/preload";
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

interface WttpApi {
  app: {
    ping: () => Promise<AppInfo>;
    openExternal: (payload: AppOpenExternalPayload) => Promise<void>;
    openDocs: (payload: AppOpenDocsPayload) => Promise<void>;
  };
  ui: {
    getState: () => Promise<UiState>;
    setState: (patch: Partial<UiState>) => Promise<UiState>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>;
    reset: () => Promise<AppSettings>;
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
  attachment: {
    save: (payload: SaveAttachmentPayload) => Promise<AttachmentInfo>;
    pick: (payload: PickAttachmentsPayload) => Promise<PickAttachmentsResult>;
    read: (payload: ReadAttachmentPayload) => Promise<ReadAttachmentResult>;
    list: (payload: ListAttachmentsPayload) => Promise<AttachmentInfo[]>;
    trash: (payload: TrashAttachmentsPayload) => Promise<TrashAttachmentsResult>;
  };
  workspace: {
    open: (payload?: OpenWorkspacePayload) => Promise<WorkspaceTree | null>;
    create: (payload: CreateWorkspacePayload) => Promise<WorkspaceTree>;
    recent: () => Promise<RecentWorkspace[]>;
    removeRecent: (payload: RemoveRecentWorkspacePayload) => Promise<RecentWorkspace[]>;
    rescan: (payload: WorkspaceRootPayload) => Promise<WorkspaceTree>;
    getUiState: (payload: WorkspaceRootPayload) => Promise<WorkspaceUiState>;
    setUiState: (payload: SetWorkspaceUiStatePayload) => Promise<void>;
    getDrafts: (payload: WorkspaceRootPayload) => Promise<WorkspaceDrafts>;
    setDrafts: (payload: SetWorkspaceDraftsPayload) => Promise<void>;
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
    copyInto: (payload: CopyNodeIntoPayload) => Promise<FolderNode | RequestNode>;
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
    getDefaultAccelerators: () => Promise<Record<MenuAction, string>>;
  };
  import: {
    detect: (payload: DetectImportPayload) => Promise<ImportFormat | null>;
    run: (payload: RunImportPayload) => Promise<ImportReport>;
    parseCurl: (payload: ParseCurlPayload) => Promise<ParsedCurlRequest | null>;
    preview: (payload: PreviewImportPayload) => Promise<ImportPreview>;
  };
  terminal: {
    open: (payload: TerminalOpenPayload) => Promise<void>;
    spawn: (payload: TerminalSpawnPayload) => Promise<{ id: number; shell: string }>;
    write: (payload: TerminalWritePayload) => Promise<void>;
    resize: (payload: TerminalResizePayload) => Promise<void>;
    kill: (id: number) => Promise<void>;
    onData: (callback: (event: TerminalDataEvent) => void) => () => void;
    onExit: (callback: (event: TerminalExitEvent) => void) => () => void;
  };
  script: {
    run: (payload: ScriptRunSpec) => Promise<ScriptRunResult>;
  };
  git: {
    info: (payload: GitRootPayload) => Promise<GitInfo>;
    status: (payload: GitRootPayload) => Promise<GitStatus>;
    refs: (payload: GitRootPayload) => Promise<GitRef[]>;
    changes: (payload: GitChangesPayload) => Promise<GitFileChange[]>;
    fileVersions: (payload: GitFileVersionsPayload) => Promise<GitFileVersions>;
    log: (payload: GitLogPayload) => Promise<GitLog>;
    restore: (payload: GitRestorePayload) => Promise<void>;
    stage: (payload: GitPathsPayload) => Promise<void>;
    unstage: (payload: GitPathsPayload) => Promise<void>;
    discard: (payload: GitPathsPayload) => Promise<void>;
    commit: (payload: GitCommitPayload) => Promise<GitCommitResult>;
    init: (payload: GitRootPayload) => Promise<void>;
    branches: (payload: GitRootPayload) => Promise<GitBranches>;
    checkout: (payload: GitCheckoutPayload) => Promise<void>;
    createBranch: (payload: GitCreateBranchPayload) => Promise<void>;
    aheadBehind: (payload: GitRootPayload) => Promise<GitAheadBehind>;
    fetch: (payload: GitRemotePayload) => Promise<GitAheadBehind>;
    pull: (payload: GitRemotePayload) => Promise<GitAheadBehind>;
    push: (payload: GitPushPayload) => Promise<GitAheadBehind>;
    cancel: (operationId: string) => Promise<void>;
  };
  runner: {
    start: (payload: RunStartPayload) => Promise<RunStartResult>;
    stop: (runId: string) => Promise<void>;
    onEvent: (callback: (event: RunEvent) => void) => () => void;
  };
  flow: {
    create: (payload: CreateFlowPayload) => Promise<FlowListItem>;
    save: (payload: SaveFlowPayload) => Promise<FlowListItem>;
    rename: (payload: RenameFlowPayload) => Promise<FlowListItem>;
    delete: (payload: FlowPathPayload) => Promise<void>;
    run: (payload: FlowRunPayload) => Promise<FlowRunResult>;
    stop: (runId: string) => Promise<void>;
    onEvent: (callback: (event: FlowEvent) => void) => () => void;
  };
  history: {
    list: (payload: RequestHistoryPayload) => Promise<HistoryEntry[]>;
    append: (payload: AppendHistoryPayload) => Promise<void>;
    clear: (payload: RequestHistoryPayload) => Promise<void>;
  };
  update: {
    getStatus: () => Promise<UpdateStatus>;
    check: () => Promise<void>;
    install: () => Promise<void>;
    onStatus: (callback: (status: UpdateStatus) => void) => () => void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    wttp: WttpApi;
  }
}

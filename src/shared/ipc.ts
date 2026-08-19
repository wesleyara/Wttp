/**
 * Contrato IPC do Wttp — importado pelos três processos.
 *
 * Esta pasta é compilada nos três bundles e por isso **não pode conter runtime**:
 * só `type` e `interface`. Os nomes de canal não são constantes exportadas, são as
 * chaves de `IpcContract` — o que dá autocomplete e verificação de tipo sem gerar
 * um único byte de JavaScript.
 */

import type { HistoryEntry } from "./history";
import type {
  AuthConfig,
  HttpRequestSpec,
  HttpResponseResult,
  KeyValueEntry,
  RequestBody,
} from "./http";
import type {
  DetectImportPayload,
  ImportFormat,
  ImportPreview,
  ImportReport,
  ParseCurlPayload,
  ParsedCurlRequest,
  PreviewImportPayload,
  RunImportPayload,
} from "./import";
import type { ScriptRunResult, ScriptRunSpec } from "./scripting";
import type {
  EnvironmentListItem,
  FolderNode,
  RecentWorkspace,
  RequestNode,
  WorkspaceDrafts,
  WorkspaceTree,
  WorkspaceUiState,
} from "./storage";

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
}

/**
 * Estado de UI persistido entre sessões (EP-02-T04). Especificado em
 * docs/conventions.md como `.wttp/ui-state.json` do workspace; como o EP-04 (leitura e
 * escrita de workspace) ainda não existe, fica hoje em `app.getPath("userData")` —
 * migra para o arquivo por-workspace quando o EP-04 chegar.
 */
export interface UiState {
  sidebarWidth: number;
  responsePanelSize: number;
  responsePanelPosition: "side" | "bottom";
}

/**
 * Configurações do app (EP-02-T05) — separadas de `UiState`: sobrevivem entre
 * workspaces diferentes, não são "estado de uma sessão de UI".
 */
export interface AppSettings {
  theme: "dark" | "light" | "system";
  /**
   * Pasta raiz onde o app organiza workspaces sob `<workspacesRootDir>/wttp/`.
   * Enumerada por `workspace:listInDir` para o switcher de workspaces (Preferences).
   * Precisa estar setada antes de criar um workspace novo (via UI ou import) — sem
   * ela não há onde decidir o destino sem perguntar ao usuário toda vez.
   */
  workspacesRootDir?: string;
}

/**
 * Ação disparada por um atalho do menu nativo (EP-02-T06), entregue ao renderer por
 * `window.wttp.menu.onAction`. Não é `invoke`/`result` como o resto do `IpcContract` —
 * é um evento main → renderer sem resposta, então fica fora dele.
 */
export type MenuAction =
  | "preferences:open"
  | "request:new"
  | "request:save"
  | "request:send"
  | "search:focus"
  | "search:quickOpen"
  | "tab:close"
  | "tab:next";

/** Payload de `dialog:saveFile` (EP-03-T07) — salvar o body de uma resposta em disco. */
export interface SaveFilePayload {
  /** Bytes exatos a gravar — nunca uma string, para não corromper corpo binário. */
  data: Uint8Array;
  suggestedName?: string;
}

export interface SaveFileResult {
  canceled: boolean;
  path?: string;
}

/** Payload de `workspace:open` (EP-04-T04) — sem `path`, abre um diálogo nativo de pasta. */
export interface OpenWorkspacePayload {
  path?: string;
}

export interface CreateWorkspacePayload {
  /** Diretório onde o workspace é criado — precisa existir e estar vazio. */
  path: string;
  name: string;
}

/** Payload comum a `node:read`/`node:delete` — caminho relativo à raiz do workspace aberto. */
export interface NodePathPayload {
  root: string;
  path: string;
}

export interface WriteNodePayload {
  root: string;
  path: string;
  node: FolderNode | RequestNode;
}

export interface MoveNodePayload {
  root: string;
  from: string;
  to: string;
  /** Posição (1-indexed) entre os irmãos do diretório de destino. */
  seq: number;
}

/** Payload de `node:create` (EP-05-T03). */
export interface CreateNodePayload {
  root: string;
  /** Caminho da pasta onde criar — `""` para a raiz do workspace. */
  parentPath: string;
  kind: "folder" | "request";
  name: string;
}

/** Payload de `node:rename` (EP-05-T03). */
export interface RenameNodePayload {
  root: string;
  path: string;
  name: string;
}

/** Payload de `node:moveInto` (EP-05-T04) — drag & drop. */
export interface MoveNodeIntoPayload {
  root: string;
  from: string;
  targetDir: string;
  /** Posição (1-indexed) entre os irmãos de `targetDir`. */
  index: number;
}

/** Payload de `dialog:pickFolder` (EP-05-T01) — `defaultPath` (EP-06.1) abre o diálogo já na pasta padrão configurada, se houver. */
export interface PickFolderPayload {
  defaultPath?: string;
}

/** Resultado de `dialog:pickFolder` (EP-05-T01) — escolher a pasta onde criar um workspace. */
export interface PickFolderResult {
  canceled: boolean;
  path?: string;
}

/** Payload de `dialog:pickFile` (EP-08-T06) — abrir um arquivo e já devolver o conteúdo como texto. */
export interface PickFilePayload {
  /** Extensões sugeridas no filtro do diálogo (sem o ponto), ex.: `["json", "yaml", "yml"]`. */
  extensions?: string[];
}

export interface PickFileResult {
  canceled: boolean;
  path?: string;
  content?: string;
}

/** Payload de `workspace:removeRecent` (EP-05-T01). */
export interface RemoveRecentWorkspacePayload {
  path: string;
}

/** Payload de `workspace:getUiState` (EP-05-T02) — a raiz do workspace cujo `.wttp/ui-state.json` ler. */
export interface WorkspaceRootPayload {
  root: string;
}

/** Payload de `workspace:setUiState` (EP-05-T02). */
export interface SetWorkspaceUiStatePayload {
  root: string;
  state: WorkspaceUiState;
}

/** Payload de `workspace:setDrafts` (EP-08.1-T01). */
export interface SetWorkspaceDraftsPayload {
  root: string;
  drafts: WorkspaceDrafts;
}

/**
 * Payload de `app:openExternal` (EP-08.1-T05, canal adiantado do escopo original de
 * EP-08.1-T07) — o main recusa qualquer `url` fora da allowlist, nunca abre o que o
 * renderer mandar sem checar.
 */
export interface AppOpenExternalPayload {
  url: string;
}

/** Payload de `history:list`/`history:clear` (EP-08.1-T03) — `path` da request dona do histórico. */
export interface RequestHistoryPayload {
  root: string;
  path: string;
}

/**
 * Payload de `history:append` (EP-08.1-T03) — `request`/`response` como saíram de
 * `http:send` (o `main` reaplica `applyAuth` para capturar também o `Authorization`
 * injetado); `secrets` são os valores reais de variável `secret: true` usados nesta
 * request, para o main mascarar antes de gravar — nunca gravados como vieram.
 */
export interface AppendHistoryPayload extends RequestHistoryPayload {
  request: HttpRequestSpec;
  response: HttpResponseResult;
  secrets: string[];
}

/** Payload de `workspace:setVariables` (EP-06-T03) — aba de variáveis globais do editor de environments. */
export interface SetWorkspaceVariablesPayload {
  root: string;
  variables: KeyValueEntry[];
}

/**
 * `key` é a chave completa `wttp:<workspaceId>:<env>:<name>` (docs/file-format.md §5) —
 * quem monta essa string é o chamador (a store de environments, EP-06), não o main.
 * Sempre relativo ao workspace atualmente aberto (`workspace:open`/`workspace:create`);
 * não existe outro jeito de trocar isso pelo IPC hoje.
 */
export interface SecretKeyPayload {
  key: string;
}

export interface SetSecretPayload {
  key: string;
  value: string;
}

/** `encrypted: false` = os segredos deste workspace estão indo para `.wttp/secrets.json` em texto puro (EP-04-T06). */
export interface SecretStorageStatus {
  encrypted: boolean;
}

/**
 * Estrutura de `src/main/http/resolver.ts` (EP-06-T01) espelhada aqui — o resolvedor é
 * puro (sem `node:*`/`electron`) mas mora em `main/`, então o contrato IPC redeclara os
 * mesmos formatos em vez de importar através da fronteira de processo.
 */
export type VariableSource = "runtime" | "environment" | "collection" | "workspace" | "dynamic";

export interface ResolvedVariablePayload {
  name: string;
  value: string;
  source: VariableSource;
}

export interface VariableScopePayload {
  runtime?: Record<string, string>;
  environment?: KeyValueEntry[];
  collection?: KeyValueEntry[];
  workspace?: KeyValueEntry[];
}

export interface ResolveTextPayload {
  text: string;
  scope: VariableScopePayload;
}

export interface ResolveTextResultPayload {
  value: string;
  unresolved: string[];
  used: ResolvedVariablePayload[];
  cycles: string[][];
}

/** Payload de `variables:resolveRequest` — aplica o resolvedor a URL, query, headers, auth e body de uma vez (EP-06-T01). */
export interface ResolveRequestPayload {
  request: {
    url: string;
    pathParams?: KeyValueEntry[];
    query: KeyValueEntry[];
    headers: KeyValueEntry[];
    auth: AuthConfig;
    body: RequestBody;
  };
  scope: VariableScopePayload;
}

export interface ResolveRequestResultPayload {
  url: string;
  query: KeyValueEntry[];
  headers: KeyValueEntry[];
  auth: AuthConfig;
  body: RequestBody;
  unresolved: string[];
  used: ResolvedVariablePayload[];
  cycles: string[][];
}

/**
 * Payload de `variables:resolveAuthChain` (EP-07-T01) — a cadeia já montada por quem
 * chama, request em `chain[0]` e pastas até a raiz da collection depois, pasta mais
 * próxima primeiro (mesma ordem de `VariableScopePayload.collection`). `undefined` é
 * uma pasta sem `folder.yaml`/sem campo `auth` — se comporta como `inherit`.
 */
export interface ResolveAuthChainPayload {
  chain: (AuthConfig | undefined)[];
}

export interface ResolveAuthChainResultPayload {
  /** Nunca `"inherit"` — tipo concreto, ou `"none"` quando a cadeia inteira herda. */
  auth: AuthConfig;
  /** Índice em `chain` que forneceu `auth`; `null` quando nada a interrompeu. */
  sourceIndex: number | null;
}

/** Payload de uma variável em `env:save` (EP-06-T02). */
export interface SaveEnvironmentVariablePayload {
  name: string;
  enabled: boolean;
  description?: string;
  secret?: boolean;
  /** `undefined` numa variável secreta = valor não alterado nesta edição — mantém o segredo já salvo. */
  value?: string;
}

/** Payload de `env:save` — cria quando `path` está ausente, atualiza quando presente. */
export interface SaveEnvironmentPayload {
  root: string;
  path?: string;
  name: string;
  variables: SaveEnvironmentVariablePayload[];
}

/** Payload comum a `env:delete`/`env:duplicate`. */
export interface EnvironmentPathPayload {
  root: string;
  path: string;
}

/** Payload de `workspace:listInDir` — enumera subpastas de `dir` que são (ou não) workspaces válidos. */
export interface ListWorkspacesInDirPayload {
  dir: string;
}

/** Uma subpasta encontrada em `workspace:listInDir` — `valid` indica se tem `wttp.yaml`. */
export interface DiscoveredWorkspace {
  path: string;
  name: string;
  valid: boolean;
}

/**
 * Canal → forma do payload e do retorno.
 *
 * Cada linha aqui é a fonte da verdade de um canal: `handle` no main e `invoke` no
 * preload derivam seus tipos deste mapa, de modo que registrar um handler com o
 * retorno errado, ou chamar um canal inexistente, quebra o `typecheck`.
 */
export interface IpcContract {
  "app:ping": { payload: void; result: AppInfo };
  "app:openExternal": { payload: AppOpenExternalPayload; result: void };
  "ui:getState": { payload: void; result: UiState };
  "ui:setState": { payload: Partial<UiState>; result: UiState };
  "settings:get": { payload: void; result: AppSettings };
  "settings:set": { payload: Partial<AppSettings>; result: AppSettings };
  "settings:reset": { payload: void; result: AppSettings };
  /**
   * Nunca rejeita por erro de rede — `HttpResponseResult.ok: false` é o resultado
   * normal para DNS, TLS, timeout ou cancelamento (EP-03-T01).
   */
  "http:send": { payload: HttpRequestSpec; result: HttpResponseResult };
  "http:cancel": { payload: string; result: void };
  "dialog:saveFile": { payload: SaveFilePayload; result: SaveFileResult };
  "dialog:pickFolder": { payload: PickFolderPayload; result: PickFolderResult };
  "dialog:pickFile": { payload: PickFilePayload; result: PickFileResult };
  "workspace:open": { payload: OpenWorkspacePayload; result: WorkspaceTree | null };
  "workspace:create": { payload: CreateWorkspacePayload; result: WorkspaceTree };
  "workspace:recent": { payload: void; result: RecentWorkspace[] };
  "workspace:removeRecent": { payload: RemoveRecentWorkspacePayload; result: RecentWorkspace[] };
  "workspace:getUiState": { payload: WorkspaceRootPayload; result: WorkspaceUiState };
  "workspace:setUiState": { payload: SetWorkspaceUiStatePayload; result: void };
  "workspace:getDrafts": { payload: WorkspaceRootPayload; result: WorkspaceDrafts };
  "workspace:setDrafts": { payload: SetWorkspaceDraftsPayload; result: void };
  "history:list": { payload: RequestHistoryPayload; result: HistoryEntry[] };
  "history:append": { payload: AppendHistoryPayload; result: void };
  "history:clear": { payload: RequestHistoryPayload; result: void };
  "workspace:setVariables": { payload: SetWorkspaceVariablesPayload; result: WorkspaceTree };
  /** Rescan sem efeitos colaterais (não toca recentes nem reinicia o watcher) — usado depois de um `node:*` que a store já sabe que aconteceu. */
  "workspace:rescan": { payload: WorkspaceRootPayload; result: WorkspaceTree };
  /** Lista subpastas de `dir` (ex. `<workspacesRootDir>/wttp`) marcando quais têm `wttp.yaml` — dir inexistente resolve `[]`, não rejeita. */
  "workspace:listInDir": { payload: ListWorkspacesInDirPayload; result: DiscoveredWorkspace[] };
  "node:read": { payload: NodePathPayload; result: FolderNode | RequestNode };
  "node:write": { payload: WriteNodePayload; result: void };
  "node:move": { payload: MoveNodePayload; result: void };
  "node:delete": { payload: NodePathPayload; result: void };
  "node:create": { payload: CreateNodePayload; result: FolderNode | RequestNode };
  "node:rename": { payload: RenameNodePayload; result: FolderNode | RequestNode };
  "node:duplicate": { payload: NodePathPayload; result: FolderNode | RequestNode };
  "node:reveal": { payload: NodePathPayload; result: void };
  "node:trash": { payload: NodePathPayload; result: void };
  "node:moveInto": { payload: MoveNodeIntoPayload; result: FolderNode | RequestNode };
  "secret:get": { payload: SecretKeyPayload; result: string | null };
  "secret:set": { payload: SetSecretPayload; result: void };
  "secret:delete": { payload: SecretKeyPayload; result: void };
  "secret:status": { payload: void; result: SecretStorageStatus };
  "env:list": { payload: WorkspaceRootPayload; result: EnvironmentListItem[] };
  "env:save": { payload: SaveEnvironmentPayload; result: EnvironmentListItem };
  "env:delete": { payload: EnvironmentPathPayload; result: void };
  "env:duplicate": { payload: EnvironmentPathPayload; result: EnvironmentListItem };
  "variables:resolveText": { payload: ResolveTextPayload; result: ResolveTextResultPayload };
  "variables:resolveRequest": {
    payload: ResolveRequestPayload;
    result: ResolveRequestResultPayload;
  };
  "variables:resolveAuthChain": {
    payload: ResolveAuthChainPayload;
    result: ResolveAuthChainResultPayload;
  };
  /** Reconhecimento heurístico de formato pelo conteúdo (EP-08-T01) — `null` quando nenhum importador reconhece. */
  "import:detect": { payload: DetectImportPayload; result: ImportFormat | null };
  "import:run": { payload: RunImportPayload; result: ImportReport };
  /** `null` quando o conteúdo não parece um comando cURL (EP-08-T05). */
  "import:parseCurl": { payload: ParseCurlPayload; result: ParsedCurlRequest | null };
  /** Parse + normalize sem `emit` (EP-08-T06) — nada é gravado em disco. */
  "import:preview": { payload: PreviewImportPayload; result: ImportPreview };
  /**
   * Nunca rejeita por falha do script — `ScriptRunResult.ok: false` é o resultado
   * normal para timeout ou exceção não tratada (EP-09-T01/T02).
   */
  "script:run": { payload: ScriptRunSpec; result: ScriptRunResult };
}

export type IpcChannel = keyof IpcContract;

export type IpcPayload<C extends IpcChannel> = IpcContract[C]["payload"];

export type IpcResult<C extends IpcChannel> = IpcContract[C]["result"];

/**
 * Códigos de erro que atravessam o IPC. A lista cresce junto com os domínios;
 * `UNKNOWN` é o destino de qualquer exceção que o main não soube classificar.
 */
export type WttpErrorCode =
  | "ENOENT"
  | "EACCES"
  | "INVALID_PAYLOAD"
  | "SCHEMA_INVALID"
  | "SCHEMA_VERSION_UNSUPPORTED"
  | "PATH_ESCAPES_ROOT"
  | "CONFLICT"
  | "SCRIPT_TIMEOUT"
  | "REQUEST_FAILED"
  | "DNS_ERROR"
  | "TLS_ERROR"
  | "TIMEOUT"
  | "CANCELLED"
  | "CONNECTION_REFUSED"
  | "IMPORT_FORMAT_UNRECOGNIZED"
  | "UNKNOWN";

/**
 * Formato único de erro do IPC. Um `Error` cru do Node nunca atravessa a ponte:
 * a stack não sobrevive à serialização estruturada e o renderer perde o código.
 */
export interface WttpError {
  code: WttpErrorCode;
  /** Legível pelo usuário, já em inglês. */
  message: string;
  /** Caminho de arquivo, linha do YAML, host — o que ajudar a localizar a causa. */
  detail?: string;
}

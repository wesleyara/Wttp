/**
 * Contrato IPC do Wttp — importado pelos três processos.
 *
 * Esta pasta é compilada nos três bundles e por isso **não pode conter runtime**:
 * só `type` e `interface`. Os nomes de canal não são constantes exportadas, são as
 * chaves de `IpcContract` — o que dá autocomplete e verificação de tipo sem gerar
 * um único byte de JavaScript.
 */

import type {
  AuthConfig,
  HttpRequestSpec,
  HttpResponseResult,
  KeyValueEntry,
  RequestBody,
} from "./http";
import type {
  EnvironmentListItem,
  FolderNode,
  RecentWorkspace,
  RequestNode,
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
}

/**
 * Ação disparada por um atalho do menu nativo (EP-02-T06), entregue ao renderer por
 * `window.wttp.menu.onAction`. Não é `invoke`/`result` como o resto do `IpcContract` —
 * é um evento main → renderer sem resposta, então fica fora dele.
 */
export type MenuAction =
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

/** Resultado de `dialog:pickFolder` (EP-05-T01) — escolher a pasta onde criar um workspace. */
export interface PickFolderResult {
  canceled: boolean;
  path?: string;
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

/**
 * Canal → forma do payload e do retorno.
 *
 * Cada linha aqui é a fonte da verdade de um canal: `handle` no main e `invoke` no
 * preload derivam seus tipos deste mapa, de modo que registrar um handler com o
 * retorno errado, ou chamar um canal inexistente, quebra o `typecheck`.
 */
export interface IpcContract {
  "app:ping": { payload: void; result: AppInfo };
  "ui:getState": { payload: void; result: UiState };
  "ui:setState": { payload: Partial<UiState>; result: UiState };
  "settings:get": { payload: void; result: AppSettings };
  "settings:set": { payload: Partial<AppSettings>; result: AppSettings };
  /**
   * Nunca rejeita por erro de rede — `HttpResponseResult.ok: false` é o resultado
   * normal para DNS, TLS, timeout ou cancelamento (EP-03-T01).
   */
  "http:send": { payload: HttpRequestSpec; result: HttpResponseResult };
  "http:cancel": { payload: string; result: void };
  "dialog:saveFile": { payload: SaveFilePayload; result: SaveFileResult };
  "dialog:pickFolder": { payload: void; result: PickFolderResult };
  "workspace:open": { payload: OpenWorkspacePayload; result: WorkspaceTree | null };
  "workspace:create": { payload: CreateWorkspacePayload; result: WorkspaceTree };
  "workspace:recent": { payload: void; result: RecentWorkspace[] };
  "workspace:removeRecent": { payload: RemoveRecentWorkspacePayload; result: RecentWorkspace[] };
  "workspace:getUiState": { payload: WorkspaceRootPayload; result: WorkspaceUiState };
  "workspace:setUiState": { payload: SetWorkspaceUiStatePayload; result: void };
  "workspace:setVariables": { payload: SetWorkspaceVariablesPayload; result: WorkspaceTree };
  /** Rescan sem efeitos colaterais (não toca recentes nem reinicia o watcher) — usado depois de um `node:*` que a store já sabe que aconteceu. */
  "workspace:rescan": { payload: WorkspaceRootPayload; result: WorkspaceTree };
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

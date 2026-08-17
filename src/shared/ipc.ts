/**
 * Contrato IPC do Wttp — importado pelos três processos.
 *
 * Esta pasta é compilada nos três bundles e por isso **não pode conter runtime**:
 * só `type` e `interface`. Os nomes de canal não são constantes exportadas, são as
 * chaves de `IpcContract` — o que dá autocomplete e verificação de tipo sem gerar
 * um único byte de JavaScript.
 */

import type { HttpRequestSpec, HttpResponseResult } from "./http";
import type { FolderNode, RecentWorkspace, RequestNode, WorkspaceTree } from "./storage";

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
export type MenuAction = "request:new" | "request:save" | "request:send" | "search:focus";

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
  "workspace:open": { payload: OpenWorkspacePayload; result: WorkspaceTree | null };
  "workspace:create": { payload: CreateWorkspacePayload; result: WorkspaceTree };
  "workspace:recent": { payload: void; result: RecentWorkspace[] };
  "node:read": { payload: NodePathPayload; result: FolderNode | RequestNode };
  "node:write": { payload: WriteNodePayload; result: void };
  "node:move": { payload: MoveNodePayload; result: void };
  "node:delete": { payload: NodePathPayload; result: void };
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

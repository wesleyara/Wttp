/**
 * Contrato IPC do Wttp — importado pelos três processos.
 *
 * Esta pasta é compilada nos três bundles e por isso **não pode conter runtime**:
 * só `type` e `interface`. Os nomes de canal não são constantes exportadas, são as
 * chaves de `IpcContract` — o que dá autocomplete e verificação de tipo sem gerar
 * um único byte de JavaScript.
 */

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
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
  | "SCRIPT_TIMEOUT"
  | "REQUEST_FAILED"
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

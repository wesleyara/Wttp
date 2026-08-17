/**
 * Tipos do núcleo HTTP (EP-03) — vocabulário compartilhado entre o motor de
 * requisição no main, o IPC e a UI do renderer. Alinhado com o YAML de
 * docs/file-format.md, mesmo que a serialização em disco seja um módulo à parte.
 *
 * `form` aparece em docs/file-format.md como um dos tipos de `body`, mas é o mesmo
 * `application/x-www-form-urlencoded` que `urlencoded` — não existe como variante
 * própria aqui.
 */

import type { WttpError } from "./ipc";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/** Uma linha de params, headers ou variáveis — nome/valor com toggle e descrição opcional. */
export interface KeyValueEntry {
  name: string;
  value: string;
  enabled: boolean;
  description?: string;
}

/** Uma entrada de multipart/form-data: campo de texto ou arquivo. */
export interface MultipartEntry {
  name: string;
  type: "text" | "file";
  /** Para `type: "file"`, caminho relativo à raiz do workspace. */
  value: string;
  enabled: boolean;
}

export type RequestBody =
  | { type: "none" }
  | { type: "json"; json: string }
  | { type: "urlencoded"; urlencoded: KeyValueEntry[] }
  | { type: "raw"; raw: string; contentType: string }
  | { type: "multipart"; multipart: MultipartEntry[] }
  /** Caminho relativo à raiz do workspace — nunca absoluto. */
  | { type: "binary"; binary: string };

export type RequestBodyType = RequestBody["type"];

export type AuthConfig =
  | { type: "none" }
  /** Herda o auth da pasta/collection pai; resolvido antes de chegar na engine. */
  | { type: "inherit" }
  | { type: "bearer"; bearer: { token: string } }
  | { type: "basic"; basic: { username: string; password: string } }
  | { type: "apikey"; apikey: { key: string; value: string; in: "header" | "query" } };

/** Sobrescreve, por request, o que está em `wttp.yaml` (docs/file-format.md §2). */
export interface HttpRequestSettings {
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  validateTls?: boolean;
}

/**
 * Requisição pronta para disparo: variáveis já resolvidas (EP-06) pela camada
 * anterior. A engine (EP-03-T02) não sabe o que é `{{...}}`.
 */
export interface HttpRequestSpec {
  requestId: string;
  method: HttpMethod;
  url: string;
  query: KeyValueEntry[];
  headers: KeyValueEntry[];
  auth: AuthConfig;
  body: RequestBody;
  settings?: HttpRequestSettings;
}

/** Fases medidas em ms; somadas batem com `total` (EP-03-T03). */
export interface HttpTiming {
  dns: number;
  connect: number;
  tls: number;
  ttfb: number;
  download: number;
  total: number;
}

export interface HttpSize {
  headersSent: number;
  bodySent: number;
  headersReceived: number;
  bodyReceived: number;
}

/** Resposta recebida com sucesso — a request chegou ao servidor e voltou. */
export interface HttpResponseSuccess {
  ok: true;
  requestId: string;
  status: number;
  statusText: string;
  headers: KeyValueEntry[];
  /** Corpo bruto; nunca presumido UTF-8 — ver `charset`. */
  body: Uint8Array;
  charset: string;
  size: HttpSize;
  timing: HttpTiming;
}

/** Sem resposta: erro de rede, DNS, TLS, timeout ou cancelamento. */
export interface HttpResponseFailure {
  ok: false;
  requestId: string;
  error: WttpError;
  /** Fases que chegaram a rodar antes da falha, quando aplicável. */
  timing?: Partial<HttpTiming>;
}

export type HttpResponseResult = HttpResponseSuccess | HttpResponseFailure;

/**
 * Evento main → renderer emitido durante o download da resposta (EP-03-T03), fora do
 * `IpcContract` pelo mesmo motivo que `MenuAction`: não é um `invoke`/`result`.
 */
export interface HttpProgressEvent {
  requestId: string;
  bytesReceived: number;
  /** Do `Content-Length` da resposta, quando presente. */
  totalBytes?: number;
}

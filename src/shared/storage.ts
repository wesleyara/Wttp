/**
 * Tipos dos arquivos YAML de workspace (EP-04), espelhando docs/file-format.md.
 * Reaproveita o vocabulário de `http.ts` (`KeyValueEntry`, `AuthConfig`, `RequestBody`,
 * `HttpMethod`) porque é o mesmo formato de request usado pela engine, só que ainda com
 * `{{variáveis}}` não resolvidas.
 */

import type {
  AuthConfig,
  HttpMethod,
  HttpRequestSettings,
  KeyValueEntry,
  RequestBody,
} from "./http";

/** Versão do schema em disco — docs/file-format.md §6, regra 1. */
export type SchemaVersion = 1;

/**
 * Chaves que esta versão do app não reconhece, capturadas na leitura e regravadas tal
 * qual — docs/file-format.md §6, regra 7. Nunca populado por código próprio do Wttp.
 */
export interface UnknownFields {
  unknown?: Record<string, unknown>;
}

export interface WorkspaceSettings {
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  validateTls?: boolean;
  scriptTimeout?: number;
}

/** `wttp.yaml` — manifesto do workspace. */
export interface WorkspaceFile extends UnknownFields {
  wttp: SchemaVersion;
  name: string;
  description?: string;
  defaultEnvironment?: string;
  settings?: WorkspaceSettings;
  variables?: KeyValueEntry[];
}

/** `folder.yaml` — pasta / collection. Opcional em disco. */
export interface FolderFile extends UnknownFields {
  wttp: SchemaVersion;
  name: string;
  seq: number;
  auth?: AuthConfig;
  docs?: string;
}

export interface RequestScripts {
  preRequest?: string;
  tests?: string;
}

/** `*.req.yaml` — uma request. */
export interface RequestFile extends UnknownFields {
  wttp: SchemaVersion;
  name: string;
  seq: number;
  method: HttpMethod;
  url: string;
  query?: KeyValueEntry[];
  headers?: KeyValueEntry[];
  auth?: AuthConfig;
  body?: RequestBody;
  settings?: HttpRequestSettings;
  scripts?: RequestScripts;
  docs?: string;
}

/** Variável de environment — `secret: true` nunca carrega valor real em disco. */
export interface EnvironmentVariable extends KeyValueEntry {
  secret?: boolean;
}

/** `environments/*.yaml`. */
export interface EnvironmentFile extends UnknownFields {
  wttp: SchemaVersion;
  name: string;
  variables?: EnvironmentVariable[];
}

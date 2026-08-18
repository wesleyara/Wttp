/**
 * Vocabulário do pipeline `parse → normalize → emit` (EP-08-T01). Um formato
 * (Postman, Insomnia, OpenAPI, cURL) implementa só `Importer` — `parse` e `normalize`
 * — e devolve uma árvore em memória. `emit` (em `emit.ts`) é infraestrutura
 * compartilhada: grava essa árvore via `storage/tree.ts`, o mesmo caminho que qualquer
 * outra escrita de nó no app, e nenhum formato escreve arquivo diretamente.
 */

import type {
  AuthConfig,
  EnvironmentVariable,
  HttpMethod,
  ImportFormat,
  ImportReportItem,
  KeyValueEntry,
  RequestBody,
} from "@shared";

export interface NormalizedRequest {
  kind: "request";
  name: string;
  method: HttpMethod;
  url: string;
  pathParams?: KeyValueEntry[];
  query?: KeyValueEntry[];
  headers?: KeyValueEntry[];
  auth?: AuthConfig;
  body?: RequestBody;
  docs?: string;
}

export interface NormalizedFolder {
  kind: "folder";
  name: string;
  auth?: AuthConfig;
  docs?: string;
  children: NormalizedNode[];
}

export type NormalizedNode = NormalizedFolder | NormalizedRequest;

export interface NormalizedEnvironment {
  name: string;
  variables: EnvironmentVariable[];
}

/** Saída de `normalize` — nada em disco ainda, só a árvore pronta para `emit`. */
export interface NormalizedImport {
  /** Nome da collection/coleção de origem — vira a pasta raiz criada em `targetPath`. */
  name: string;
  children: NormalizedNode[];
  environments: NormalizedEnvironment[];
  /** Tudo que não teve equivalente — docs/backlog EP-08: nunca descartado em silêncio. */
  notConverted: ImportReportItem[];
}

/** Contrato que cada formato implementa. `detect` nunca lança — só diz sim ou não. */
export interface Importer {
  format: ImportFormat;
  detect(content: string, filename?: string): boolean;
  parse(content: string): unknown;
  normalize(parsed: unknown): NormalizedImport;
}

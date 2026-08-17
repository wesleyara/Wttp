import type { EnvironmentFile, FolderFile, RequestFile, WorkspaceFile } from "@shared";

import { parse } from "yaml";

import {
  ENVIRONMENT_FIELD_ORDER,
  FOLDER_FIELD_ORDER,
  REQUEST_FIELD_ORDER,
  splitKnownFields,
  WORKSPACE_FIELD_ORDER,
} from "./fieldOrder";
import { migrateToCurrent, resolveSchemaVersion } from "./migrations/registry";

/** Sem `unknown` quando não sobra nenhum campo desconhecido — mantém o objeto limpo. */
function withUnknown<T extends object>(known: T, unknown: Record<string, unknown>): T {
  return Object.keys(unknown).length > 0 ? { ...known, unknown } : known;
}

/**
 * Normaliza o objeto parseado para a versão atual do schema antes de separar campos
 * conhecidos — `wttp` ausente vira versão 1 (docs/file-format.md §6, regra 1), e uma
 * versão maior que a suportada recusa aqui em vez de seguir com um formato que esta
 * versão do app não entende.
 */
function normalizeVersion(raw: Record<string, unknown>): Record<string, unknown> {
  const { version } = resolveSchemaVersion(raw);
  return migrateToCurrent(raw, version);
}

export function parseWorkspace(raw: string): WorkspaceFile {
  const { known, unknown } = splitKnownFields(normalizeVersion(parse(raw)), WORKSPACE_FIELD_ORDER);
  return withUnknown(known as unknown as WorkspaceFile, unknown);
}

export function parseFolder(raw: string): FolderFile {
  const { known, unknown } = splitKnownFields(normalizeVersion(parse(raw)), FOLDER_FIELD_ORDER);
  return withUnknown(known as unknown as FolderFile, unknown);
}

export function parseRequest(raw: string): RequestFile {
  const { known, unknown } = splitKnownFields(normalizeVersion(parse(raw)), REQUEST_FIELD_ORDER);
  return withUnknown(known as unknown as RequestFile, unknown);
}

export function parseEnvironment(raw: string): EnvironmentFile {
  const { known, unknown } = splitKnownFields(
    normalizeVersion(parse(raw)),
    ENVIRONMENT_FIELD_ORDER,
  );
  return withUnknown(known as unknown as EnvironmentFile, unknown);
}

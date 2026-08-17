import type { EnvironmentFile, FolderFile, RequestFile, WorkspaceFile } from "@shared";

import { parse } from "yaml";

import {
  ENVIRONMENT_FIELD_ORDER,
  FOLDER_FIELD_ORDER,
  REQUEST_FIELD_ORDER,
  splitKnownFields,
  WORKSPACE_FIELD_ORDER,
} from "./fieldOrder";

/** Sem `unknown` quando não sobra nenhum campo desconhecido — mantém o objeto limpo. */
function withUnknown<T extends object>(known: T, unknown: Record<string, unknown>): T {
  return Object.keys(unknown).length > 0 ? { ...known, unknown } : known;
}

export function parseWorkspace(raw: string): WorkspaceFile {
  const { known, unknown } = splitKnownFields(parse(raw), WORKSPACE_FIELD_ORDER);
  return withUnknown(known as unknown as WorkspaceFile, unknown);
}

export function parseFolder(raw: string): FolderFile {
  const { known, unknown } = splitKnownFields(parse(raw), FOLDER_FIELD_ORDER);
  return withUnknown(known as unknown as FolderFile, unknown);
}

export function parseRequest(raw: string): RequestFile {
  const { known, unknown } = splitKnownFields(parse(raw), REQUEST_FIELD_ORDER);
  return withUnknown(known as unknown as RequestFile, unknown);
}

export function parseEnvironment(raw: string): EnvironmentFile {
  const { known, unknown } = splitKnownFields(parse(raw), ENVIRONMENT_FIELD_ORDER);
  return withUnknown(known as unknown as EnvironmentFile, unknown);
}

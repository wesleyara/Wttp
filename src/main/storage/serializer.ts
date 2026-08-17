import type {
  AuthConfig,
  EnvironmentFile,
  FolderFile,
  RequestBody,
  RequestFile,
  WorkspaceFile,
} from "@shared";

import {
  AUTH_FIELD_ORDER,
  BODY_FIELD_ORDER,
  ENVIRONMENT_FIELD_ORDER,
  ENVIRONMENT_VARIABLE_FIELD_ORDER,
  FOLDER_FIELD_ORDER,
  KEY_VALUE_ENTRY_FIELD_ORDER,
  MULTIPART_ENTRY_FIELD_ORDER,
  REQUEST_FIELD_ORDER,
  REQUEST_SETTINGS_FIELD_ORDER,
  SCRIPTS_FIELD_ORDER,
  WORKSPACE_FIELD_ORDER,
  WORKSPACE_SETTINGS_FIELD_ORDER,
} from "./fieldOrder";
import { buildDocument, orderFields, stringifyDocument } from "./yamlDocument";

function orderEntries<T extends object>(
  entries: readonly T[] | undefined,
  order: readonly string[],
): Record<string, unknown>[] | undefined {
  if (!entries) return undefined;
  return entries.map(entry => orderFields(entry as unknown as Record<string, unknown>, order));
}

function orderAuth(auth: AuthConfig | undefined): Record<string, unknown> | undefined {
  if (!auth) return undefined;
  return orderFields(
    auth as unknown as Record<string, unknown>,
    AUTH_FIELD_ORDER[auth.type] ?? ["type"],
  );
}

function orderBody(body: RequestBody | undefined): Record<string, unknown> | undefined {
  if (!body) return undefined;

  const ordered: Record<string, unknown> = { ...body };
  if (body.type === "urlencoded") {
    ordered.urlencoded = orderEntries(body.urlencoded, KEY_VALUE_ENTRY_FIELD_ORDER);
  }
  if (body.type === "multipart") {
    ordered.multipart = orderEntries(body.multipart, MULTIPART_ENTRY_FIELD_ORDER);
  }

  return orderFields(ordered, BODY_FIELD_ORDER[body.type] ?? ["type"]);
}

/** Aplica a regra "segredo jamais em YAML": valor sempre vazio quando `secret: true`. */
function orderEnvironmentVariables(
  variables: EnvironmentFile["variables"],
): Record<string, unknown>[] | undefined {
  if (!variables) return undefined;
  return variables.map(variable =>
    orderFields(
      { ...variable, value: variable.secret ? "" : variable.value },
      ENVIRONMENT_VARIABLE_FIELD_ORDER,
    ),
  );
}

export function serializeWorkspace(workspace: WorkspaceFile): string {
  const settings = workspace.settings
    ? orderFields(workspace.settings as Record<string, unknown>, WORKSPACE_SETTINGS_FIELD_ORDER)
    : undefined;

  const known = orderFields(
    {
      ...workspace,
      settings,
      variables: orderEntries(workspace.variables, KEY_VALUE_ENTRY_FIELD_ORDER),
    },
    WORKSPACE_FIELD_ORDER,
  );

  const doc = buildDocument({ ...known, ...workspace.unknown }, [["variables"]]);
  return stringifyDocument(doc);
}

export function serializeFolder(folder: FolderFile): string {
  const known = orderFields({ ...folder, auth: orderAuth(folder.auth) }, FOLDER_FIELD_ORDER);

  const doc = buildDocument({ ...known, ...folder.unknown });
  return stringifyDocument(doc);
}

export function serializeRequest(request: RequestFile): string {
  const settings = request.settings
    ? orderFields(request.settings as Record<string, unknown>, REQUEST_SETTINGS_FIELD_ORDER)
    : undefined;

  const scripts = request.scripts
    ? orderFields(request.scripts as Record<string, unknown>, SCRIPTS_FIELD_ORDER)
    : undefined;

  const known = orderFields(
    {
      ...request,
      query: orderEntries(request.query, KEY_VALUE_ENTRY_FIELD_ORDER),
      headers: orderEntries(request.headers, KEY_VALUE_ENTRY_FIELD_ORDER),
      auth: orderAuth(request.auth),
      body: orderBody(request.body),
      settings,
      scripts,
    },
    REQUEST_FIELD_ORDER,
  );

  const doc = buildDocument({ ...known, ...request.unknown }, [
    ["query"],
    ["headers"],
    ["body", "urlencoded"],
    ["body", "multipart"],
  ]);
  return stringifyDocument(doc);
}

export function serializeEnvironment(environment: EnvironmentFile): string {
  const known = orderFields(
    { ...environment, variables: orderEnvironmentVariables(environment.variables) },
    ENVIRONMENT_FIELD_ORDER,
  );

  const doc = buildDocument({ ...known, ...environment.unknown }, [["variables"]]);
  return stringifyDocument(doc);
}

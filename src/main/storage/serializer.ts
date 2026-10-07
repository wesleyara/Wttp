import type {
  AuthConfig,
  EnvironmentFile,
  FlowFile,
  FolderFile,
  RequestBody,
  RequestFile,
  WorkspaceFile,
} from "@shared";

import { isMap, isSeq } from "yaml";

import {
  AUTH_FIELD_ORDER,
  BODY_FIELD_ORDER,
  ENVIRONMENT_FIELD_ORDER,
  ENVIRONMENT_VARIABLE_FIELD_ORDER,
  FLOW_CONDITION_FIELD_ORDER,
  FLOW_EDGE_FIELD_ORDER,
  FLOW_FIELD_ORDER,
  FLOW_MAPPING_FIELD_ORDER,
  FLOW_NODE_FIELD_ORDER,
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
  const scripts = folder.scripts
    ? orderFields(folder.scripts as Record<string, unknown>, SCRIPTS_FIELD_ORDER)
    : undefined;

  const known = orderFields(
    {
      ...folder,
      auth: orderAuth(folder.auth),
      variables: orderEntries(folder.variables, KEY_VALUE_ENTRY_FIELD_ORDER),
      scripts,
    },
    FOLDER_FIELD_ORDER,
  );

  const doc = buildDocument({ ...known, ...folder.unknown }, [["variables"]]);
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
      pathParams: orderEntries(request.pathParams, KEY_VALUE_ENTRY_FIELD_ORDER),
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
    ["pathParams"],
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

export function serializeFlow(flow: FlowFile): string {
  const nodes = flow.nodes.map(node =>
    orderFields(
      {
        ...node,
        when: node.when
          ? orderFields(node.when as unknown as Record<string, unknown>, FLOW_CONDITION_FIELD_ORDER)
          : undefined,
      },
      FLOW_NODE_FIELD_ORDER,
    ),
  );

  const known = orderFields(
    {
      ...flow,
      nodes,
      edges: orderEntries(flow.edges, FLOW_EDGE_FIELD_ORDER),
      mappings: orderEntries(flow.mappings, FLOW_MAPPING_FIELD_ORDER),
    },
    FLOW_FIELD_ORDER,
  );

  const doc = buildDocument({ ...known, ...flow.unknown }, [["nodes"], ["edges"], ["mappings"]]);
  // Um nó de função carrega código: em bloco, o `code` sai como literal `|` legível no diff,
  // em vez de uma linha só cheia de `\n`.
  const items = doc.getIn(["nodes"], true);
  if (isSeq(items)) {
    for (const item of items.items) {
      if (isMap(item) && item.has("code")) item.flow = false;
    }
  }
  return stringifyDocument(doc);
}

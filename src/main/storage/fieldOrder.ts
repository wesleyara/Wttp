/**
 * Ordem de chaves canônica por tipo de arquivo — arch-docs/file-format.md §6, regra 2.
 * A ordem é definida aqui, não pela ordem de inserção do objeto em memória, para que
 * salvar sem alterar nada produza bytes idênticos.
 */

export const WORKSPACE_FIELD_ORDER = [
  "wttp",
  "name",
  "description",
  "defaultEnvironment",
  "settings",
  "variables",
] as const;

export const WORKSPACE_SETTINGS_FIELD_ORDER = [
  "timeout",
  "followRedirects",
  "maxRedirects",
  "validateTls",
  "scriptTimeout",
] as const;

export const FOLDER_FIELD_ORDER = [
  "wttp",
  "name",
  "seq",
  "auth",
  "variables",
  "scripts",
  "docs",
] as const;

export const REQUEST_FIELD_ORDER = [
  "wttp",
  "name",
  "seq",
  "method",
  "url",
  "pathParams",
  "query",
  "headers",
  "auth",
  "body",
  "settings",
  "scripts",
  "docs",
] as const;

export const REQUEST_SETTINGS_FIELD_ORDER = [
  "timeout",
  "followRedirects",
  "maxRedirects",
  "validateTls",
] as const;

export const FLOW_FIELD_ORDER = [
  "wttp",
  "name",
  "start",
  "nodes",
  "edges",
  "mappings",
  "maxSteps",
] as const;

export const FLOW_NODE_FIELD_ORDER = [
  "id",
  "type",
  "request",
  "when",
  "intervalMs",
  "maxAttempts",
  "ms",
  "outputs",
  "code",
  "x",
  "y",
] as const;

export const FLOW_CONDITION_FIELD_ORDER = ["source", "path", "op", "value"] as const;

export const FLOW_EDGE_FIELD_ORDER = ["from", "to", "when", "output"] as const;

export const FLOW_MAPPING_FIELD_ORDER = ["from", "to"] as const;

export const SCRIPTS_FIELD_ORDER = ["preRequest", "tests"] as const;

export const ENVIRONMENT_FIELD_ORDER = ["wttp", "name", "variables"] as const;

/** Ordem por variante de `body.type` — arch-docs/file-format.md §4 "Variantes de body". */
export const BODY_FIELD_ORDER: Record<string, readonly string[]> = {
  none: ["type"],
  json: ["type", "json"],
  urlencoded: ["type", "urlencoded"],
  raw: ["type", "contentType", "raw"],
  multipart: ["type", "multipart"],
  binary: ["type", "binary"],
};

/** Ordem por variante de `auth.type` — arch-docs/file-format.md §4 "Variantes de auth". */
export const AUTH_FIELD_ORDER: Record<string, readonly string[]> = {
  none: ["type"],
  inherit: ["type"],
  bearer: ["type", "bearer"],
  basic: ["type", "basic"],
  apikey: ["type", "apikey"],
};

export const KEY_VALUE_ENTRY_FIELD_ORDER = ["name", "value", "enabled", "description"] as const;

export const ENVIRONMENT_VARIABLE_FIELD_ORDER = [
  "name",
  "value",
  "enabled",
  "secret",
  "description",
] as const;

export const MULTIPART_ENTRY_FIELD_ORDER = ["name", "type", "value", "enabled"] as const;

/** Divide um objeto lido do YAML entre chaves conhecidas e desconhecidas do schema. */
export function splitKnownFields(
  raw: Record<string, unknown>,
  knownKeys: readonly string[],
): { known: Record<string, unknown>; unknown: Record<string, unknown> } {
  const known: Record<string, unknown> = {};
  const unknown: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if ((knownKeys as readonly string[]).includes(key)) known[key] = value;
    else unknown[key] = value;
  }

  return { known, unknown };
}

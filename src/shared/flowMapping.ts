/**
 * Gramática do `from` de um mapeamento de flow (arch-docs/file-format.md §10) e a leitura de
 * um valor de uma resposta — pura, usada pela validação do arquivo, pela engine, pelas
 * condições (`condition.ts`) e pela UI.
 */

import { queryJsonPath } from "./jsonpath";

export const FLOW_NODE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const FLOW_VARIABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export type ValueSource =
  { kind: "status" } | { kind: "header"; name: string } | { kind: "body"; path: string };

export type MappingSource = ValueSource & { nodeId: string };

/** `login.res.body.data.token` → origem estruturada; `null` se o texto não segue a gramática. */
export function parseMappingSource(from: string): MappingSource | null {
  const marker = from.indexOf(".res.");
  if (marker <= 0) return null;
  const nodeId = from.slice(0, marker);
  if (!FLOW_NODE_ID_PATTERN.test(nodeId)) return null;
  const rest = from.slice(marker + ".res.".length);
  if (rest === "status") return { nodeId, kind: "status" };
  if (rest.startsWith("headers.")) {
    const name = rest.slice("headers.".length);
    return name ? { nodeId, kind: "header", name } : null;
  }
  if (rest.startsWith("body.")) {
    const path = rest.slice("body.".length);
    return path ? { nodeId, kind: "body", path } : null;
  }
  return null;
}

/** O texto de `from` de volta, a partir da origem estruturada. */
export function formatMappingSource(nodeId: string, source: ValueSource): string {
  if (source.kind === "status") return `${nodeId}.res.status`;
  if (source.kind === "header") return `${nodeId}.res.headers.${source.name}`;
  return `${nodeId}.res.body.${source.path}`;
}

/** Caminho do arquivo (`data.token`, `items[0].id`, `["x-y"].z`) → expressão JSONPath. Um `$...` já completo passa como está. */
export function toJsonPath(path: string): string {
  if (path.startsWith("$")) return path;
  return path.startsWith("[") ? `$${path}` : `$.${path}`;
}

export interface ResponseView {
  status: number;
  headers: { name: string; value: string }[];
  /** Corpo já decodificado em texto. */
  body: string;
}

export type ExtractResult = { ok: true; value: string } | { ok: false; message: string };

export function stringifyValue(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "");
}

/** Valor que a origem tira da resposta, como texto — ou o motivo de não ter achado. */
export function extractValue(source: ValueSource, response: ResponseView): ExtractResult {
  if (source.kind === "status") return { ok: true, value: String(response.status) };
  if (source.kind === "header") {
    const wanted = source.name.toLowerCase();
    const header = response.headers.find(entry => entry.name.toLowerCase() === wanted);
    return header
      ? { ok: true, value: header.value }
      : { ok: false, message: `header "${source.name}" not found in the response` };
  }
  let document: unknown;
  try {
    document = JSON.parse(response.body);
  } catch {
    return { ok: false, message: "the response body is not JSON" };
  }
  let matches: unknown[];
  try {
    matches = queryJsonPath(document, toJsonPath(source.path));
  } catch (error) {
    return {
      ok: false,
      message: `invalid body path "${source.path}": ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (matches.length === 0) {
    return { ok: false, message: `"${source.path}" not found in the response body` };
  }
  return { ok: true, value: stringifyValue(matches[0]) };
}

export const extractMappingValue = extractValue;

export interface BodyField {
  /** Caminho no formato do arquivo (`data.token`, `items[0].id`). */
  path: string;
  /** Valor curto para mostrar ao lado da porta. */
  preview: string;
}

const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Campos de um JSON de resposta que dá para mapear — as "portas de saída" do canvas. Só
 * folhas, com o primeiro item de cada array, até `maxDepth` níveis e `maxFields` campos.
 */
export function listBodyFields(document: unknown, maxDepth = 4, maxFields = 60): BodyField[] {
  const out: BodyField[] = [];
  const walk = (value: unknown, path: string, depth: number): void => {
    if (out.length >= maxFields) return;
    if (Array.isArray(value)) {
      if (value.length > 0 && depth < maxDepth) walk(value[0], `${path}[0]`, depth + 1);
      else if (path) out.push({ path, preview: "[]" });
      return;
    }
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0 && path) out.push({ path, preview: "{}" });
      if (depth >= maxDepth) {
        if (path) out.push({ path, preview: "{…}" });
        return;
      }
      for (const [key, child] of entries) {
        const segment = PLAIN_KEY.test(key)
          ? path
            ? `${path}.${key}`
            : key
          : `${path}[${JSON.stringify(key)}]`;
        walk(child, segment, depth + 1);
      }
      return;
    }
    if (path) {
      const text = stringifyValue(value);
      out.push({ path, preview: text.length > 24 ? `${text.slice(0, 23)}…` : text });
    }
  };
  walk(document, "", 0);
  return out;
}

/** Nomes de `{{variável}}` num texto (sem as dinâmicas `$uuid`...), na ordem em que aparecem, sem repetir. */
export function variableNamesIn(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)) {
    const name = match[1];
    if (!name.startsWith("$") && !names.includes(name)) names.push(name);
  }
  return names;
}

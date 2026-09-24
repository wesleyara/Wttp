/**
 * Diff de duas respostas do histórico (ClickLocal #49): "o que mudou desde a última
 * vez?". Puro. Para JSON o diff é **semântico** — a ordem das chaves não importa, e cada
 * diferença sai por caminho (`$.data.items[2].price: 10 → 12`), no mesmo formato JSONPath
 * do filtro do painel de resposta (#48). Texto cai para diff por linha.
 *
 * Campos que mudam sempre (timestamp, request id, header `Date`) viram ruído — a lista de
 * ignorados (por request, em `.wttp/ui-state.json`) some com eles e com tudo abaixo deles;
 * `[*]` num padrão casa qualquer índice (`$.items[*].updatedAt`).
 */

import type { HistoryEntry, KeyValueEntry } from "@shared";

import { lineDiff, type LineDiffEntry } from "./structuralDiff";

export type ValueChangeKind = "added" | "removed" | "changed" | "typeChanged";

export interface JsonChange {
  path: string;
  kind: ValueChangeKind;
  before?: string;
  after?: string;
}

export interface HeaderChange {
  name: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
}

/** Prefixo dos padrões ignorados que são de header, não de body — `header:Date`. */
export const HEADER_IGNORE_PREFIX = "header:";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** `$.a.b`, `$['chave-com-hífen']`, `$.items[0]` — compatível com o filtro JSONPath. */
export function childPath(parent: string, key: string | number): string {
  if (typeof key === "number") return `${parent}[${key}]`;
  return IDENTIFIER.test(key) ? `${parent}.${key}` : `${parent}['${key.replace(/'/g, "\\'")}']`;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Um padrão ignorado casa o próprio caminho e tudo abaixo dele; `[*]` casa qualquer índice. */
export function compileIgnores(patterns: string[]): (path: string) => boolean {
  const regexes = patterns
    .filter(pattern => pattern.startsWith("$"))
    .map(
      pattern =>
        new RegExp(`^${escapeRegex(pattern).replace(/\\\[\\\*\\\]/g, "\\[\\d+\\]")}(?:$|[.[])`),
    );
  return path => regexes.some(regex => regex.test(path));
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function show(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Compara dois valores JSON. Objetos por chave (ordem irrelevante); arrays por posição;
 * `null` é um valor (≠ ausente); trocar o tipo (`10` → `"10"`) é `typeChanged`.
 */
export function diffJson(
  before: unknown,
  after: unknown,
  isIgnored: (path: string) => boolean = () => false,
  path = "$",
): JsonChange[] {
  if (isIgnored(path)) return [];
  const a = typeOf(before);
  const b = typeOf(after);

  if (a !== b) {
    return [{ path, kind: "typeChanged", before: show(before), after: show(after) }];
  }
  if (a === "object") {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    const changes: JsonChange[] = [];
    for (const key of Object.keys(left)) {
      const child = childPath(path, key);
      if (!(key in right)) {
        if (!isIgnored(child))
          changes.push({ path: child, kind: "removed", before: show(left[key]) });
      } else {
        changes.push(...diffJson(left[key], right[key], isIgnored, child));
      }
    }
    for (const key of Object.keys(right)) {
      const child = childPath(path, key);
      if (!(key in left) && !isIgnored(child)) {
        changes.push({ path: child, kind: "added", after: show(right[key]) });
      }
    }
    return changes;
  }
  if (a === "array") {
    const left = before as unknown[];
    const right = after as unknown[];
    const changes: JsonChange[] = [];
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const child = childPath(path, i);
      if (i >= right.length) {
        if (!isIgnored(child))
          changes.push({ path: child, kind: "removed", before: show(left[i]) });
      } else if (i >= left.length) {
        if (!isIgnored(child)) changes.push({ path: child, kind: "added", after: show(right[i]) });
      } else {
        changes.push(...diffJson(left[i], right[i], isIgnored, child));
      }
    }
    return changes;
  }
  return before === after
    ? []
    : [{ path, kind: "changed", before: show(before), after: show(after) }];
}

/** Headers sem diferenciar maiúsculas; repetidos (`Set-Cookie`) viram a lista de valores. */
export function diffHeaders(
  before: KeyValueEntry[],
  after: KeyValueEntry[],
  ignored: Set<string> = new Set(),
): HeaderChange[] {
  const group = (list: KeyValueEntry[]): Map<string, { name: string; values: string[] }> => {
    const map = new Map<string, { name: string; values: string[] }>();
    for (const header of list) {
      const key = header.name.toLowerCase();
      const entry = map.get(key) ?? { name: header.name, values: [] };
      entry.values.push(header.value);
      map.set(key, entry);
    }
    return map;
  };
  const a = group(before);
  const b = group(after);
  const changes: HeaderChange[] = [];
  for (const [key, left] of a) {
    if (ignored.has(key)) continue;
    const right = b.get(key);
    if (!right) changes.push({ name: left.name, kind: "removed", before: left.values.join(", ") });
    else if (left.values.join("\n") !== right.values.join("\n")) {
      changes.push({
        name: left.name,
        kind: "changed",
        before: left.values.join(", "),
        after: right.values.join(", "),
      });
    }
  }
  for (const [key, right] of b) {
    if (!a.has(key) && !ignored.has(key)) {
      changes.push({ name: right.name, kind: "added", after: right.values.join(", ") });
    }
  }
  return changes;
}

export type BodyDiff =
  | { mode: "json"; changes: JsonChange[] }
  | { mode: "text"; lines: LineDiffEntry[]; changed: boolean }
  | { mode: "none" };

export interface ResponseDiff {
  /** `null` quando o status (ou o erro) é o mesmo. */
  status: { before: string; after: string } | null;
  headers: HeaderChange[];
  body: BodyDiff;
  /** Algum dos dois bodies foi truncado ao gravar o histórico — o diff não viu tudo. */
  truncated: boolean;
}

export interface ResponseDiffOptions {
  ignored?: string[];
  ignoreHeaders?: boolean;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Compara `before` (a execução mais antiga) com `after` (a mais nova). */
export function diffResponses(
  before: HistoryEntry,
  after: HistoryEntry,
  options: ResponseDiffOptions = {},
): ResponseDiff {
  const ignored = options.ignored ?? [];
  const a = before.response;
  const b = after.response;
  const label = (response: HistoryEntry["response"]): string =>
    response.ok ? `${response.status} ${response.statusText}`.trim() : response.error.code;
  const status = label(a) === label(b) ? null : { before: label(a), after: label(b) };

  if (!a.ok || !b.ok) return { status, headers: [], body: { mode: "none" }, truncated: false };

  const headerIgnores = new Set(
    ignored
      .filter(pattern => pattern.startsWith(HEADER_IGNORE_PREFIX))
      .map(pattern => pattern.slice(HEADER_IGNORE_PREFIX.length).toLowerCase()),
  );
  const headers = options.ignoreHeaders ? [] : diffHeaders(a.headers, b.headers, headerIgnores);

  const left = parseJson(a.body);
  const right = parseJson(b.body);
  const body: BodyDiff =
    left.ok && right.ok
      ? { mode: "json", changes: diffJson(left.value, right.value, compileIgnores(ignored)) }
      : { mode: "text", lines: lineDiff(a.body, b.body), changed: a.body !== b.body };

  return { status, headers, body, truncated: a.bodyTruncated || b.bodyTruncated };
}

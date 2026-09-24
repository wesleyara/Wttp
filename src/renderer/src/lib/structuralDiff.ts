/**
 * Diff campo a campo dos arquivos do workspace (ClickLocal #52): "header `X-Api-Version`
 * 1 → 2, body `limit` removido", não YAML linha a linha. Puro — recebe os dois lados já
 * parseados pelo storage do main (`git:fileVersions`).
 *
 * Listas com nome (query, headers, path params, variáveis, campos de form) são comparadas
 * por nome, não por posição: reordenar não é mudança, e mudar o valor de um header aparece
 * como "alterado", não como removido + adicionado. Texto longo (scripts, docs, body JSON/raw)
 * vira diff por linha.
 */

import type {
  AuthConfig,
  EnvironmentFile,
  FolderFile,
  KeyValueEntry,
  RequestBody,
  RequestFile,
  WorkspaceFile,
} from "@shared";

export type DiffKind = "added" | "removed" | "changed";

export interface LineDiffEntry {
  type: "same" | "added" | "removed";
  text: string;
}

export interface DiffItem {
  kind: DiffKind;
  /** O que mudou dentro da seção — nome do header, "Token", "Type"... `""` para a seção inteira. */
  label: string;
  before?: string;
  after?: string;
  /** Diff por linha, para texto de várias linhas (scripts, docs, body). */
  lines?: LineDiffEntry[];
}

export type DiffSectionId =
  | "name"
  | "method"
  | "url"
  | "pathParams"
  | "query"
  | "headers"
  | "body"
  | "auth"
  | "preRequest"
  | "tests"
  | "docs"
  | "variables"
  | "settings"
  | "position"
  | "other";

export interface DiffSection {
  id: DiffSectionId;
  items: DiffItem[];
}

// --- Texto -----------------------------------------------------------------------------

/** Acima disso o LCS vira O(n·m) caro demais — o texto inteiro é mostrado como trocado. */
const MAX_LINE_DIFF_CELLS = 4_000_000;

/** Diff por linha (LCS), linhas iguais incluídas para dar contexto. */
export function lineDiff(before: string, after: string): LineDiffEntry[] {
  const a = before === "" ? [] : before.replace(/\n$/, "").split("\n");
  const b = after === "" ? [] : after.replace(/\n$/, "").split("\n");
  if (a.length * b.length > MAX_LINE_DIFF_CELLS) {
    return [
      ...a.map(text => ({ type: "removed" as const, text })),
      ...b.map(text => ({ type: "added" as const, text })),
    ];
  }

  // lcs[i][j] = tamanho da maior subsequência comum de a[i..] e b[j..]
  const lcs: Uint32Array[] = Array.from(
    { length: a.length + 1 },
    () => new Uint32Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: LineDiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "removed", text: a[i++] });
    } else {
      out.push({ type: "added", text: b[j++] });
    }
  }
  while (i < a.length) out.push({ type: "removed", text: a[i++] });
  while (j < b.length) out.push({ type: "added", text: b[j++] });
  return out;
}

function textItem(
  label: string,
  before: string | undefined,
  after: string | undefined,
): DiffItem | null {
  const a = before ?? "";
  const b = after ?? "";
  if (a === b) return null;
  const kind: DiffKind = a === "" ? "added" : b === "" ? "removed" : "changed";
  return { kind, label, lines: lineDiff(a, b) };
}

function scalarItem(label: string, before: unknown, after: unknown): DiffItem | null {
  const a = before === undefined || before === null || before === "" ? undefined : String(before);
  const b = after === undefined || after === null || after === "" ? undefined : String(after);
  if (a === b) return null;
  if (a === undefined) return { kind: "added", label, after: b };
  if (b === undefined) return { kind: "removed", label, before: a };
  return { kind: "changed", label, before: a, after: b };
}

// --- Listas nome/valor ------------------------------------------------------------------

function describeEntry(entry: KeyValueEntry & { secret?: boolean }): string {
  const value = entry.secret ? "•••• (secret)" : entry.value;
  return entry.enabled ? value : `${value} (disabled)`;
}

/**
 * Pareia por nome (sem diferenciar maiúsculas quando `caseInsensitive`, como headers HTTP)
 * e, entre nomes repetidos, pela ordem de aparição — a posição na lista não conta.
 */
export function diffEntries(
  before: (KeyValueEntry & { secret?: boolean })[] | undefined,
  after: (KeyValueEntry & { secret?: boolean })[] | undefined,
  caseInsensitive = false,
): DiffItem[] {
  const key = (name: string): string => (caseInsensitive ? name.toLowerCase() : name);
  type Entry = KeyValueEntry & { secret?: boolean };
  const group = (list: Entry[]): Map<string, Entry[]> => {
    const map = new Map<string, (KeyValueEntry & { secret?: boolean })[]>();
    for (const entry of list) {
      const bucket = map.get(key(entry.name)) ?? [];
      bucket.push(entry);
      map.set(key(entry.name), bucket);
    }
    return map;
  };
  const a = group(before ?? []);
  const b = group(after ?? []);
  const items: DiffItem[] = [];

  for (const [name, left] of a) {
    const right = b.get(name) ?? [];
    left.forEach((entry, index) => {
      const other = right[index];
      if (!other) {
        items.push({ kind: "removed", label: entry.name, before: describeEntry(entry) });
        return;
      }
      const changed =
        entry.value !== other.value ||
        entry.enabled !== other.enabled ||
        Boolean(entry.secret) !== Boolean(other.secret) ||
        (entry.description ?? "") !== (other.description ?? "");
      if (changed) {
        const label = entry.name === other.name ? entry.name : `${entry.name} → ${other.name}`;
        const before = describeEntry(entry);
        const after = describeEntry(other);
        items.push({
          kind: "changed",
          label,
          before: before === after ? (entry.description ?? "") : before,
          after: before === after ? (other.description ?? "") : after,
        });
      }
    });
    right
      .slice(left.length)
      .forEach(entry =>
        items.push({ kind: "added", label: entry.name, after: describeEntry(entry) }),
      );
  }
  for (const [name, right] of b) {
    if (a.has(name)) continue;
    right.forEach(entry =>
      items.push({ kind: "added", label: entry.name, after: describeEntry(entry) }),
    );
  }
  return items;
}

// --- Body e auth -------------------------------------------------------------------------

function diffBody(before: RequestBody | undefined, after: RequestBody | undefined): DiffItem[] {
  const a = before ?? { type: "none" };
  const b = after ?? { type: "none" };
  const items: DiffItem[] = [];
  if (a.type !== b.type)
    items.push({ kind: "changed", label: "Type", before: a.type, after: b.type });

  const text = (body: RequestBody): string | undefined =>
    body.type === "json" ? body.json : body.type === "raw" ? body.raw : undefined;
  const pushText = (item: DiffItem | null): void => void (item && items.push(item));

  if (text(a) !== undefined || text(b) !== undefined)
    pushText(textItem("Content", text(a), text(b)));
  if (a.type === "raw" || b.type === "raw") {
    const item = scalarItem(
      "Content-Type",
      a.type === "raw" ? a.contentType : undefined,
      b.type === "raw" ? b.contentType : undefined,
    );
    if (item) items.push(item);
  }
  if (a.type === "urlencoded" || b.type === "urlencoded") {
    items.push(
      ...diffEntries(
        a.type === "urlencoded" ? a.urlencoded : undefined,
        b.type === "urlencoded" ? b.urlencoded : undefined,
      ),
    );
  }
  if (a.type === "multipart" || b.type === "multipart") {
    const asEntries = (body: RequestBody): KeyValueEntry[] | undefined =>
      body.type === "multipart"
        ? body.multipart.map(part => ({
            name: part.name,
            value: part.type === "file" ? `file: ${part.value}` : part.value,
            enabled: part.enabled,
          }))
        : undefined;
    items.push(...diffEntries(asEntries(a), asEntries(b)));
  }
  if (a.type === "binary" || b.type === "binary") {
    const item = scalarItem(
      "File",
      a.type === "binary" ? a.binary : undefined,
      b.type === "binary" ? b.binary : undefined,
    );
    if (item) items.push(item);
  }
  return items;
}

function authFields(auth: AuthConfig | undefined): Record<string, string> {
  switch (auth?.type) {
    case "bearer":
      return { Token: auth.bearer.token };
    case "basic":
      return { Username: auth.basic.username, Password: auth.basic.password };
    case "apikey":
      return { Key: auth.apikey.key, Value: auth.apikey.value, In: auth.apikey.in };
    default:
      return {};
  }
}

function diffAuth(before: AuthConfig | undefined, after: AuthConfig | undefined): DiffItem[] {
  // Sem `auth` no arquivo, a request se comporta como `none` (ver `buildTab`) — pastas, como `inherit`.
  const aType = before?.type ?? "none";
  const bType = after?.type ?? "none";
  const items: DiffItem[] = [];
  if (aType !== bType) items.push({ kind: "changed", label: "Type", before: aType, after: bType });
  const a = authFields(before);
  const b = authFields(after);
  for (const label of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const item = scalarItem(label, a[label], b[label]);
    if (item) items.push(item);
  }
  return items;
}

// --- Arquivos -----------------------------------------------------------------------------

function section(id: DiffSectionId, items: (DiffItem | null)[]): DiffSection | null {
  const kept = items.filter((item): item is DiffItem => item !== null);
  return kept.length > 0 ? { id, items: kept } : null;
}

function sections(list: (DiffSection | null)[]): DiffSection[] {
  return list.filter((entry): entry is DiffSection => entry !== null);
}

/** Campos que o formato não conhece mas o arquivo tem (arch-docs/file-format.md) — preservados, então também comparados. */
function diffUnknown(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  known: string[],
): DiffItem[] {
  const pick = (value: Record<string, unknown> | undefined): Record<string, unknown> =>
    Object.fromEntries(Object.entries(value ?? {}).filter(([k]) => !known.includes(k)));
  const a = pick(before);
  const b = pick(after);
  const items: DiffItem[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const item = scalarItem(
      k,
      a[k] === undefined ? undefined : JSON.stringify(a[k]),
      b[k] === undefined ? undefined : JSON.stringify(b[k]),
    );
    if (item) items.push(item);
  }
  return items;
}

export function diffRequest(before: RequestFile | null, after: RequestFile | null): DiffSection[] {
  const a = before ?? ({} as Partial<RequestFile>);
  const b = after ?? ({} as Partial<RequestFile>);
  return sections([
    section("name", [scalarItem("", a.name, b.name)]),
    section("method", [scalarItem("", a.method, b.method)]),
    section("url", [scalarItem("", a.url, b.url)]),
    section("pathParams", diffEntries(a.pathParams, b.pathParams)),
    section("query", diffEntries(a.query, b.query)),
    section("headers", diffEntries(a.headers, b.headers, true)),
    section("body", diffBody(a.body, b.body)),
    section("auth", diffAuth(a.auth, b.auth)),
    section("preRequest", [textItem("", a.scripts?.preRequest, b.scripts?.preRequest)]),
    section("tests", [textItem("", a.scripts?.tests, b.scripts?.tests)]),
    section("docs", [textItem("", a.docs, b.docs)]),
    section(
      "settings",
      diffUnknown(a.settings as Record<string, unknown>, b.settings as Record<string, unknown>, []),
    ),
    section("position", [scalarItem("", a.seq, b.seq)]),
    section("other", diffUnknown(a.unknown, b.unknown, [])),
  ]);
}

export function diffFolder(before: FolderFile | null, after: FolderFile | null): DiffSection[] {
  const a = before ?? ({} as Partial<FolderFile>);
  const b = after ?? ({} as Partial<FolderFile>);
  return sections([
    section("name", [scalarItem("", a.name, b.name)]),
    section(
      "auth",
      a.auth || b.auth
        ? diffAuth(a.auth ?? { type: "inherit" }, b.auth ?? { type: "inherit" })
        : [],
    ),
    section("variables", diffEntries(a.variables, b.variables)),
    section("preRequest", [textItem("", a.scripts?.preRequest, b.scripts?.preRequest)]),
    section("tests", [textItem("", a.scripts?.tests, b.scripts?.tests)]),
    section("docs", [textItem("", a.docs, b.docs)]),
    section("position", [scalarItem("", a.seq, b.seq)]),
    section("other", diffUnknown(a.unknown, b.unknown, [])),
  ]);
}

export function diffEnvironment(
  before: EnvironmentFile | null,
  after: EnvironmentFile | null,
): DiffSection[] {
  const a = before ?? ({} as Partial<EnvironmentFile>);
  const b = after ?? ({} as Partial<EnvironmentFile>);
  return sections([
    section("name", [scalarItem("", a.name, b.name)]),
    section("variables", diffEntries(a.variables, b.variables)),
    section("other", diffUnknown(a.unknown, b.unknown, [])),
  ]);
}

export function diffWorkspace(
  before: WorkspaceFile | null,
  after: WorkspaceFile | null,
): DiffSection[] {
  const a = before ?? ({} as Partial<WorkspaceFile>);
  const b = after ?? ({} as Partial<WorkspaceFile>);
  return sections([
    section("name", [scalarItem("", a.name, b.name)]),
    section("variables", diffEntries(a.variables, b.variables)),
    section("settings", [
      ...diffUnknown(
        a.settings as Record<string, unknown> | undefined,
        b.settings as Record<string, unknown> | undefined,
        [],
      ),
      scalarItem("defaultEnvironment", a.defaultEnvironment, b.defaultEnvironment),
      scalarItem("description", a.description, b.description),
    ]),
    section("other", diffUnknown(a.unknown, b.unknown, [])),
  ]);
}

/**
 * Visualização em árvore do body JSON (ClickLocal #47): funções puras — achatar os nós
 * visíveis, montar o caminho de um nó e gerar as linhas de script que "Save to variable"
 * e "Add assertion" inserem. Nada aqui toca DOM nem store.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type PathSegment = string | number;

/** Filhos exibidos por nó antes do "show more" — array de 100 mil itens nunca vira 100 mil linhas. */
export const CHILD_PAGE_SIZE = 100;

export type JsonKind = "object" | "array" | "string" | "number" | "boolean" | "null";

export interface TreeRow {
  /** Chave estável (caminho serializado) — também o id de expandido/colapsado. */
  id: string;
  depth: number;
  path: PathSegment[];
  /** Chave/índice exibidos; `null` na raiz. */
  label: string | null;
  kind: JsonKind;
  value: Json;
  /** Resumo de container ("{3}"/"[12]"); vazio para primitivos. */
  summary: string;
  expandable: boolean;
  expanded: boolean;
  /** Linha sintética "N more…" no fim de uma página de filhos; `path` aponta para o pai. */
  more?: { remaining: number };
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function kindOf(value: Json): JsonKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as JsonKind;
}

export function rowId(path: PathSegment[]): string {
  return JSON.stringify(path);
}

/** Acesso JS a partir de `res.json`: `.chave`, `[0]` ou `["chave-com-hífen"]`. */
export function accessorFor(path: PathSegment[]): string {
  return path
    .map(segment => {
      if (typeof segment === "number") return `[${segment}]`;
      return IDENTIFIER.test(segment) ? `.${segment}` : `[${JSON.stringify(segment)}]`;
    })
    .join("");
}

/** Caminho exibido/copiado: `data.items[0].id` (a raiz é `$`). */
export function displayPath(path: PathSegment[]): string {
  if (path.length === 0) return "$";
  const accessor = accessorFor(path);
  return accessor.startsWith(".") ? accessor.slice(1) : accessor;
}

/** Nome de variável sugerido a partir da última chave — `access-token` → `access_token`. */
export function suggestVarName(path: PathSegment[]): string {
  const last = [...path].reverse().find((s): s is string => typeof s === "string");
  const cleaned = (last ?? "value")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1");
  return cleaned || "value";
}

function summaryOf(value: Json): string {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).length}}`;
  return "";
}

function childrenOf(value: Json): [PathSegment, Json][] {
  if (Array.isArray(value)) return value.map((item, index) => [index, item]);
  if (value !== null && typeof value === "object") return Object.entries(value);
  return [];
}

/**
 * Achata só o que está visível: filhos de um nó recolhido nunca são visitados, e cada
 * container mostra no máximo `limit(id)` filhos — é o que mantém um JSON de 5MB fluido.
 */
export function flattenTree(
  root: Json,
  expanded: ReadonlySet<string>,
  shown: ReadonlyMap<string, number> = new Map(),
): TreeRow[] {
  const rows: TreeRow[] = [];

  function visit(value: Json, path: PathSegment[], label: string | null, depth: number): void {
    const id = rowId(path);
    const kind = kindOf(value);
    const children = childrenOf(value);
    const expandable = kind === "object" || kind === "array";
    const isExpanded = expandable && children.length > 0 && expanded.has(id);
    rows.push({
      id,
      depth,
      path,
      label,
      kind,
      value,
      summary: summaryOf(value),
      expandable: expandable && children.length > 0,
      expanded: isExpanded,
    });
    if (!isExpanded) return;
    const limit = shown.get(id) ?? CHILD_PAGE_SIZE;
    for (const [key, child] of children.slice(0, limit)) {
      visit(child, [...path, key], String(key), depth + 1);
    }
    if (children.length > limit) {
      rows.push({
        id: `${id}#more`,
        depth: depth + 1,
        path,
        label: null,
        kind: "null",
        value: null,
        summary: "",
        expandable: false,
        expanded: false,
        more: { remaining: children.length - limit },
      });
    }
  }

  visit(root, [], null, 0);
  return rows;
}

/** Ids expandidos por padrão: só a raiz — o resto é do usuário, para JSON grande não pagar por nada não pedido. */
export function defaultExpanded(): Set<string> {
  return new Set([rowId([])]);
}

/** Acrescenta uma linha ao fim do script sem mexer no que já havia. */
export function appendScriptLine(script: string | undefined, line: string): string {
  const existing = (script ?? "").replace(/\s+$/, "");
  return existing === "" ? `${line}\n` : `${existing}\n${line}\n`;
}

export function setVarLine(name: string, path: PathSegment[]): string {
  return `wttp.setVar(${JSON.stringify(name)}, res.json${accessorFor(path)});`;
}

const MAX_LITERAL_CHARS = 300;

/** `null` quando o valor é grande demais para virar um literal legível no script. */
export function literalFor(value: Json): string | null {
  const text = JSON.stringify(value);
  return text.length <= MAX_LITERAL_CHARS ? text : null;
}

export type AssertionKind = "equals" | "truthy";

/** Asserção completa — `expect` só funciona dentro de `test` (arch-docs/scripting.md). */
export function assertionLine(
  path: PathSegment[],
  value: Json,
  kind: AssertionKind,
): string | null {
  const subject = `res.json${accessorFor(path)}`;
  const title = JSON.stringify(
    kind === "equals" ? `${displayPath(path)} matches` : `${displayPath(path)} is set`,
  );
  if (kind === "truthy") return `test(${title}, () => expect(${subject}).toBeTruthy());`;
  const literal = literalFor(value);
  if (literal === null) return null;
  const matcher = value !== null && typeof value === "object" ? "toEqual" : "toBe";
  return `test(${title}, () => expect(${subject}).${matcher}(${literal}));`;
}

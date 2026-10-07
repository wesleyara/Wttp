/**
 * JSONPath do filtro do painel de resposta (ClickLocal #48). Implementação própria em
 * vez de `jsonpath-plus`: o modo "safe" dele já teve duas execuções de código arbitrário
 * (CVE-2024-21534, CVE-2025-1302), e desligar o `eval` dele desliga junto os filtros
 * `[?()]`. Aqui a gramática é fechada — nada vira código: não existe `eval`/`Function`,
 * chamada de função nem acesso a protótipo; um filtro só compara caminhos e literais.
 *
 * Suportado (o subconjunto do RFC 9535 que se usa de verdade para inspecionar uma
 * resposta):
 *
 *   $                       raiz
 *   .nome  ['nome']  ["n"]  membro
 *   [0]  [-1]               índice (negativo conta do fim)
 *   [0:2]  [::2]  [-2:]     slice
 *   .*  [*]                 todos os filhos
 *   ..nome  ..*  ..[0]      descida recursiva
 *   ['a','b']  [0,2]        união
 *   [?(@.x > 1)]  [?@.x]    filtro: == != < <= > >=, && || !, parênteses; operandos
 *                           `@...`/`$...` (caminho singular), número, string, true,
 *                           false, null. `@.length` de um array/string é o tamanho.
 *
 * O resultado é sempre a lista de valores encontrados, na ordem do documento.
 */

export class JsonPathError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
    this.name = "JsonPathError";
  }
}

type Json = unknown;

type Selector =
  | { kind: "name"; name: string }
  | { kind: "index"; index: number }
  | { kind: "slice"; start?: number; end?: number; step?: number }
  | { kind: "wildcard" }
  | { kind: "filter"; expr: Expr };

interface Segment {
  descendant: boolean;
  selectors: Selector[];
}

/** Caminho singular dentro de um filtro (`@.a[0].b`, `$.x`) — só nome e índice. */
interface SingularPath {
  root: "@" | "$";
  steps: ({ kind: "name"; name: string } | { kind: "index"; index: number })[];
}

type Literal = string | number | boolean | null;

type Expr =
  | { kind: "or" | "and"; left: Expr; right: Expr }
  | { kind: "not"; expr: Expr }
  | { kind: "compare"; op: CompareOp; left: Operand; right: Operand }
  | { kind: "exists"; operand: Operand };

type CompareOp = "==" | "!=" | "<" | "<=" | ">" | ">=";

type Operand = { kind: "path"; path: SingularPath } | { kind: "literal"; value: Literal };

const NAME_CHAR = /[\p{L}\p{N}_$-]/u;
const NAME_START = /[\p{L}_$]/u;

class Parser {
  private pos = 0;

  constructor(private readonly src: string) {}

  parse(): Segment[] {
    this.skipSpaces();
    if (this.peek() !== "$") this.fail("A JSONPath starts with $");
    this.pos += 1;
    const segments: Segment[] = [];
    this.skipSpaces();
    while (this.pos < this.src.length) {
      segments.push(this.segment());
      this.skipSpaces();
    }
    return segments;
  }

  private segment(): Segment {
    if (this.src.startsWith("..", this.pos)) {
      this.pos += 2;
      if (this.peek() === "[") return { descendant: true, selectors: this.bracket() };
      return { descendant: true, selectors: [this.dotMember()] };
    }
    if (this.peek() === ".") {
      this.pos += 1;
      return { descendant: false, selectors: [this.dotMember()] };
    }
    if (this.peek() === "[") return { descendant: false, selectors: this.bracket() };
    return this.fail(`Unexpected "${this.peek()}"`);
  }

  private dotMember(): Selector {
    if (this.peek() === "*") {
      this.pos += 1;
      return { kind: "wildcard" };
    }
    return { kind: "name", name: this.name() };
  }

  private name(): string {
    const start = this.pos;
    if (!NAME_START.test(this.peek())) this.fail("Expected a member name");
    while (this.pos < this.src.length && NAME_CHAR.test(this.peek())) this.pos += 1;
    return this.src.slice(start, this.pos);
  }

  private bracket(): Selector[] {
    this.expect("[");
    const selectors: Selector[] = [];
    do {
      this.skipSpaces();
      selectors.push(this.selector());
      this.skipSpaces();
    } while (this.eat(","));
    this.expect("]");
    return selectors;
  }

  private selector(): Selector {
    const char = this.peek();
    if (char === "*") {
      this.pos += 1;
      return { kind: "wildcard" };
    }
    if (char === "'" || char === '"') return { kind: "name", name: this.string() };
    if (char === "?") {
      this.pos += 1;
      this.skipSpaces();
      return { kind: "filter", expr: this.orExpr() };
    }
    if (char === ":" || char === "-" || /\d/.test(char)) return this.indexOrSlice();
    return this.fail(`Unexpected "${char || "end of input"}" in brackets`);
  }

  private indexOrSlice(): Selector {
    const first = this.optionalInt();
    this.skipSpaces();
    if (this.peek() !== ":") {
      if (first === undefined) this.fail("Expected an index");
      return { kind: "index", index: first as number };
    }
    this.pos += 1;
    this.skipSpaces();
    const end = this.optionalInt();
    this.skipSpaces();
    let step: number | undefined;
    if (this.eat(":")) {
      this.skipSpaces();
      step = this.optionalInt();
      if (step === 0) this.fail("Slice step can't be 0");
    }
    return { kind: "slice", start: first, end, step };
  }

  private optionalInt(): number | undefined {
    const match = /^-?\d+/.exec(this.src.slice(this.pos));
    if (!match) return undefined;
    this.pos += match[0].length;
    return Number(match[0]);
  }

  private string(): string {
    const quote = this.peek();
    const start = this.pos;
    this.pos += 1;
    let value = "";
    while (this.pos < this.src.length && this.peek() !== quote) {
      const char = this.peek();
      if (char === "\\") {
        const next = this.src[this.pos + 1];
        if (next === undefined) break;
        value += next === "n" ? "\n" : next === "t" ? "\t" : next;
        this.pos += 2;
      } else {
        value += char;
        this.pos += 1;
      }
    }
    if (this.peek() !== quote) throw new JsonPathError("Unterminated string", start);
    this.pos += 1;
    return value;
  }

  // --- Filtros -----------------------------------------------------------------------

  private orExpr(): Expr {
    let left = this.andExpr();
    while (this.eatOp("||")) left = { kind: "or", left, right: this.andExpr() };
    return left;
  }

  private andExpr(): Expr {
    let left = this.unaryExpr();
    while (this.eatOp("&&")) left = { kind: "and", left, right: this.unaryExpr() };
    return left;
  }

  private unaryExpr(): Expr {
    this.skipSpaces();
    if (this.peek() === "!" && this.src[this.pos + 1] !== "=") {
      this.pos += 1;
      return { kind: "not", expr: this.unaryExpr() };
    }
    if (this.peek() === "(") {
      this.pos += 1;
      const inner = this.orExpr();
      this.skipSpaces();
      this.expect(")");
      return inner;
    }
    const left = this.operand();
    this.skipSpaces();
    const op = (["==", "!=", "<=", ">=", "<", ">"] as const).find(candidate =>
      this.src.startsWith(candidate, this.pos),
    );
    if (!op) {
      if (left.kind === "literal") this.fail("A literal alone isn't a filter");
      return { kind: "exists", operand: left };
    }
    this.pos += op.length;
    this.skipSpaces();
    return { kind: "compare", op, left, right: this.operand() };
  }

  private operand(): Operand {
    this.skipSpaces();
    const char = this.peek();
    if (char === "@" || char === "$") {
      this.pos += 1;
      return { kind: "path", path: { root: char, steps: this.singularSteps() } };
    }
    if (char === "'" || char === '"') return { kind: "literal", value: this.string() };
    const number = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.src.slice(this.pos));
    if (number) {
      this.pos += number[0].length;
      return { kind: "literal", value: Number(number[0]) };
    }
    for (const [word, value] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (
        this.src.startsWith(word, this.pos) &&
        !NAME_CHAR.test(this.src[this.pos + word.length] ?? "")
      ) {
        this.pos += word.length;
        return { kind: "literal", value };
      }
    }
    return this.fail(`Unexpected "${char || "end of input"}" in filter`);
  }

  private singularSteps(): SingularPath["steps"] {
    const steps: SingularPath["steps"] = [];
    for (;;) {
      if (this.peek() === "." && this.src[this.pos + 1] !== ".") {
        this.pos += 1;
        steps.push({ kind: "name", name: this.name() });
      } else if (this.peek() === "[") {
        this.pos += 1;
        this.skipSpaces();
        const char = this.peek();
        if (char === "'" || char === '"') {
          steps.push({ kind: "name", name: this.string() });
        } else {
          const index = this.optionalInt();
          if (index === undefined) this.fail("Only names and indexes are allowed in a filter path");
          steps.push({ kind: "index", index: index as number });
        }
        this.skipSpaces();
        this.expect("]");
      } else {
        return steps;
      }
    }
  }

  // --- Utilitários -------------------------------------------------------------------

  private peek(): string {
    return this.src[this.pos] ?? "";
  }

  private eat(char: string): boolean {
    if (this.peek() !== char) return false;
    this.pos += 1;
    return true;
  }

  private eatOp(op: string): boolean {
    this.skipSpaces();
    if (!this.src.startsWith(op, this.pos)) return false;
    this.pos += op.length;
    return true;
  }

  private expect(char: string): void {
    if (!this.eat(char)) this.fail(`Expected "${char}"`);
  }

  private skipSpaces(): void {
    while (/\s/.test(this.peek())) this.pos += 1;
  }

  private fail(message: string): never {
    throw new JsonPathError(message, this.pos);
  }
}

// --- Avaliação ---------------------------------------------------------------------------

function isObject(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Só propriedades próprias — `constructor`/`__proto__` nunca resolvem para o protótipo. */
function member(value: Json, name: string): { found: boolean; value?: Json } {
  if (isObject(value) && Object.prototype.hasOwnProperty.call(value, name)) {
    return { found: true, value: value[name] };
  }
  return { found: false };
}

function normalizeIndex(index: number, length: number): number {
  return index < 0 ? length + index : index;
}

function children(value: Json): Json[] {
  if (Array.isArray(value)) return value;
  if (isObject(value)) return Object.values(value);
  return [];
}

function descendants(value: Json, out: Json[]): void {
  out.push(value);
  for (const child of children(value)) descendants(child, out);
}

function sliceIndices(length: number, start?: number, end?: number, step = 1): number[] {
  const indices: number[] = [];
  const clamp = (n: number, low: number, high: number): number => Math.min(Math.max(n, low), high);
  if (step > 0) {
    const from = clamp(normalizeIndex(start ?? 0, length), 0, length);
    const to = clamp(normalizeIndex(end ?? length, length), 0, length);
    for (let i = from; i < to; i += step) indices.push(i);
  } else {
    const from = clamp(normalizeIndex(start ?? length - 1, length), -1, length - 1);
    const to = clamp(normalizeIndex(end ?? -length - 1, length), -1, length - 1);
    for (let i = from; i > to; i += step) indices.push(i);
  }
  return indices;
}

function resolveSingular(
  path: SingularPath,
  current: Json,
  root: Json,
): { found: boolean; value?: Json } {
  let value = path.root === "@" ? current : root;
  for (const step of path.steps) {
    if (step.kind === "name") {
      // `@.length` de array/string: o tamanho (Postman/jsonpath-plus usam assim).
      if (step.name === "length" && (Array.isArray(value) || typeof value === "string")) {
        value = value.length;
        continue;
      }
      const next = member(value, step.name);
      if (!next.found) return { found: false };
      value = next.value;
    } else {
      if (!Array.isArray(value)) return { found: false };
      const index = normalizeIndex(step.index, value.length);
      if (index < 0 || index >= value.length) return { found: false };
      value = value[index];
    }
  }
  return { found: true, value };
}

function operandValue(
  operand: Operand,
  current: Json,
  root: Json,
): { found: boolean; value?: Json } {
  if (operand.kind === "literal") return { found: true, value: operand.value };
  return resolveSingular(operand.path, current, root);
}

function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function compare(
  op: CompareOp,
  left: { found: boolean; value?: Json },
  right: { found: boolean; value?: Json },
): boolean {
  if (op === "==" || op === "!=") {
    const equal =
      left.found && right.found ? deepEqual(left.value, right.value) : left.found === right.found;
    return op === "==" ? equal : !equal;
  }
  if (!left.found || !right.found) return false;
  const a = left.value;
  const b = right.value;
  const comparable =
    (typeof a === "number" && typeof b === "number") ||
    (typeof a === "string" && typeof b === "string");
  if (!comparable) return false;
  const x = a as number | string;
  const y = b as number | string;
  switch (op) {
    case "<":
      return x < y;
    case "<=":
      return x <= y;
    case ">":
      return x > y;
    case ">=":
      return x >= y;
  }
}

function test(expr: Expr, current: Json, root: Json): boolean {
  switch (expr.kind) {
    case "or":
      return test(expr.left, current, root) || test(expr.right, current, root);
    case "and":
      return test(expr.left, current, root) && test(expr.right, current, root);
    case "not":
      return !test(expr.expr, current, root);
    case "exists":
      return operandValue(expr.operand, current, root).found;
    case "compare":
      return compare(
        expr.op,
        operandValue(expr.left, current, root),
        operandValue(expr.right, current, root),
      );
  }
}

function select(selector: Selector, value: Json, root: Json, out: Json[]): void {
  switch (selector.kind) {
    case "name": {
      const next = member(value, selector.name);
      if (next.found) out.push(next.value);
      return;
    }
    case "index": {
      if (!Array.isArray(value)) return;
      const index = normalizeIndex(selector.index, value.length);
      if (index >= 0 && index < value.length) out.push(value[index]);
      return;
    }
    case "slice":
      if (!Array.isArray(value)) return;
      for (const i of sliceIndices(value.length, selector.start, selector.end, selector.step)) {
        out.push(value[i]);
      }
      return;
    case "wildcard":
      out.push(...children(value));
      return;
    case "filter":
      for (const child of children(value)) {
        if (test(selector.expr, child, root)) out.push(child);
      }
  }
}

/** Compila uma vez; lança `JsonPathError` (com a posição) para uma expressão inválida. */
export function compileJsonPath(expression: string): (document: Json) => Json[] {
  const segments = new Parser(expression).parse();
  return document => {
    let nodes: Json[] = [document];
    for (const segment of segments) {
      const inputs: Json[] = [];
      if (segment.descendant) for (const node of nodes) descendants(node, inputs);
      else inputs.push(...nodes);
      const next: Json[] = [];
      for (const node of inputs) {
        for (const selector of segment.selectors) select(selector, node, document, next);
      }
      nodes = next;
    }
    return nodes;
  };
}

export function queryJsonPath(document: Json, expression: string): Json[] {
  return compileJsonPath(expression)(document);
}

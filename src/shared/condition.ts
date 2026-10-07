/**
 * Condição estruturada de "o que a resposta precisa ter" — operador + caminho + valor, nunca
 * código. É o único avaliador: o "poll until" do modo watch (ClickLocal #50) e os nós de
 * condição/poll de um flow (#59) decidem pelo mesmo `evaluateCondition`. Quem precisa de
 * lógica livre usa um script de tests.
 */

import type { HttpResponseSuccess } from "./http";

import { extractValue, type ResponseView, type ValueSource } from "./flowMapping";

export type ConditionSource = "status" | "body" | "header" | "assertions";

export type ConditionOp =
  "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists" | "notExists";

export const CONDITION_SOURCES: readonly ConditionSource[] = [
  "status",
  "body",
  "header",
  "assertions",
];
export const CONDITION_OPS: readonly ConditionOp[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "exists",
  "notExists",
];

export interface Condition {
  source: ConditionSource;
  /** `body`: caminho no JSON (`data.status`, ou um JSONPath `$...`); `header`: o nome. */
  path?: string;
  /** Ausente em `assertions`. */
  op?: ConditionOp;
  /** Comparado como texto, ou como número em `gt`/`gte`/`lt`/`lte`. Ausente em `exists`/`notExists`. */
  value?: string;
}

export interface ConditionInput {
  /** `null` = a request não teve resposta (erro de rede, cancelada). */
  response: ResponseView | null;
  assertions: { passed: boolean }[];
}

export function viewOfResponse(response: HttpResponseSuccess): ResponseView {
  let body: string;
  try {
    body = new TextDecoder(response.charset || "utf-8").decode(response.body);
  } catch {
    body = new TextDecoder("utf-8").decode(response.body);
  }
  return { status: response.status, headers: response.headers, body };
}

/** Operadores que não olham para um valor esperado. */
export function opNeedsValue(op: ConditionOp | undefined): boolean {
  return op !== "exists" && op !== "notExists";
}

function valueSource(condition: Condition): ValueSource | null {
  if (condition.source === "status") return { kind: "status" };
  if (condition.source === "header") {
    return condition.path ? { kind: "header", name: condition.path } : null;
  }
  if (condition.source === "body") {
    return condition.path ? { kind: "body", path: condition.path } : null;
  }
  return null;
}

function compare(op: ConditionOp, actual: string, expected: string): boolean {
  switch (op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "contains":
      return actual.includes(expected);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = Number(actual);
      const b = Number(expected);
      if (
        actual.trim() === "" ||
        expected.trim() === "" ||
        !Number.isFinite(a) ||
        !Number.isFinite(b)
      ) {
        return false;
      }
      return op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b;
    }
    default:
      return false;
  }
}

/** A condição bate com esta resposta? Sem resposta, só `notExists` e `neq` de um valor ausente fazem sentido — tudo o mais é `false`. */
export function evaluateCondition(condition: Condition, input: ConditionInput): boolean {
  if (condition.source === "assertions") {
    // Sem nenhuma asserção não há o que "ter passado" — decidir por isso seria mentira.
    return input.assertions.length > 0 && input.assertions.every(a => a.passed);
  }
  const source = valueSource(condition);
  const op = condition.op ?? "eq";
  if (!source) return false;
  if (!input.response) return op === "notExists";
  const found = extractValue(source, input.response);
  if (op === "exists") return found.ok;
  if (op === "notExists") return !found.ok;
  if (!found.ok) return false;
  return compare(op, found.value, condition.value ?? "");
}

/** Mensagem curta do que a condição pede — para o resultado do nó e para o canvas. */
export function describeCondition(condition: Condition): string {
  if (condition.source === "assertions") return "assertions passed";
  const subject =
    condition.source === "status"
      ? "status"
      : condition.source === "header"
        ? `header ${condition.path ?? "?"}`
        : `body ${condition.path ?? "?"}`;
  const op = condition.op ?? "eq";
  const symbol: Record<ConditionOp, string> = {
    eq: "==",
    neq: "!=",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
    contains: "contains",
    exists: "exists",
    notExists: "doesn't exist",
  };
  return opNeedsValue(op)
    ? `${subject} ${symbol[op]} ${condition.value ?? ""}`
    : `${subject} ${symbol[op]}`;
}

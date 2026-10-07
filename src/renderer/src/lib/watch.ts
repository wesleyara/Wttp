/**
 * Modo watch (ClickLocal #50): a configuração de uma sessão, a condição de parada
 * ("poll until") e a conversão de uma resposta em memória para o formato que o diff do
 * histórico (#49) entende. Puro — o laço e os timers vivem em `stores/watch.ts`.
 */

import type { HistoryEntry, HttpResponseResult } from "@shared";

import { type Condition, evaluateCondition, viewOfResponse } from "@shared/condition";
import { queryJsonPath } from "@shared/jsonpath";

export const MIN_INTERVAL_SECONDS = 1;
export const DEFAULT_INTERVAL_SECONDS = 5;
export const DEFAULT_MAX_ATTEMPTS = 20;
export const MAX_ATTEMPTS_LIMIT = 1000;

export type UntilKind = "none" | "status" | "json" | "tests";

export interface WatchConfig {
  intervalSeconds: number;
  until: UntilKind;
  /** `until: "status"` — o código esperado (ex. `200`). */
  status: string;
  /** `until: "json"` — caminho JSONPath e o valor esperado (comparado como texto). */
  jsonPath: string;
  jsonValue: string;
  /** Obrigatório com "poll until": o watch nunca fica preso esperando algo que não vem. */
  maxAttempts: number;
}

export function defaultWatchConfig(): WatchConfig {
  return {
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    until: "none",
    status: "200",
    jsonPath: "",
    jsonValue: "",
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
  };
}

export type WatchConfigError =
  "interval" | "maxAttempts" | "status" | "jsonPath" | "jsonPathSyntax";

/** `null` quando a configuração pode iniciar uma sessão. */
export function validateWatchConfig(config: WatchConfig): WatchConfigError | null {
  if (!Number.isFinite(config.intervalSeconds) || config.intervalSeconds < MIN_INTERVAL_SECONDS) {
    return "interval";
  }
  if (config.until === "none") return null;
  if (
    !Number.isInteger(config.maxAttempts) ||
    config.maxAttempts < 1 ||
    config.maxAttempts > MAX_ATTEMPTS_LIMIT
  ) {
    return "maxAttempts";
  }
  if (config.until === "status" && !/^\d{3}$/.test(config.status.trim())) return "status";
  if (config.until === "json") {
    if (config.jsonPath.trim() === "") return "jsonPath";
    try {
      queryJsonPath(null, config.jsonPath.trim());
    } catch {
      return "jsonPathSyntax";
    }
  }
  return null;
}

export interface UntilInput {
  result: HttpResponseResult;
  assertions: { passed: boolean }[];
}

/** A condição de "poll until" do watch, na forma estruturada que flows e watch compartilham. */
export function untilCondition(config: WatchConfig): Condition | null {
  switch (config.until) {
    case "none":
      return null;
    case "status":
      return { source: "status", op: "eq", value: config.status.trim() };
    case "tests":
      return { source: "assertions" };
    case "json":
      return { source: "body", path: config.jsonPath.trim(), op: "eq", value: config.jsonValue };
  }
}

/** A condição de "poll until" foi atendida por esta resposta? Sempre `false` sem condição. */
export function untilMatches(config: WatchConfig, input: UntilInput): boolean {
  const condition = untilCondition(config);
  if (!condition) return false;
  return evaluateCondition(condition, {
    response: input.result.ok ? viewOfResponse(input.result) : null,
    assertions: input.assertions,
  });
}

/** Corpo grande demais não entra no diff inteiro — mesmo teto do painel de resposta. */
const MAX_DIFF_BODY_BYTES = 2_000_000;

/** A resposta de uma iteração como uma entrada de histórico (só em memória, nunca gravada) para `diffResponses`. */
export function resultToEntry(result: HttpResponseResult, at: Date = new Date()): HistoryEntry {
  const base = {
    id: `watch-${at.getTime()}`,
    at: at.toISOString(),
    request: {
      method: "GET" as const,
      url: "",
      query: [],
      headers: [],
      body: { type: "none" as const },
    },
  };
  if (!result.ok) return { ...base, response: { ok: false, error: result.error } };
  const truncated = result.body.byteLength > MAX_DIFF_BODY_BYTES;
  const slice = truncated ? result.body.subarray(0, MAX_DIFF_BODY_BYTES) : result.body;
  let body: string;
  try {
    body = new TextDecoder(result.charset || "utf-8").decode(slice);
  } catch {
    body = new TextDecoder("utf-8").decode(slice);
  }
  return {
    ...base,
    response: {
      ok: true,
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      charset: result.charset,
      size: result.size,
      timing: result.timing,
      body,
      bodyTruncated: truncated,
    },
  };
}

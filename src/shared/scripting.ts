/**
 * Tipos da API de scripting (EP-09) — vocabulário compartilhado entre o runner isolado
 * no main (`src/main/scripts`), o IPC e a UI do renderer. A API exposta ao script do
 * usuário (`wttp.setVar/getVar`, `req`, `res`, `test`, `expect`, `console.*`) está
 * documentada em docs/scripting.md; estes tipos são só a forma que atravessa o IPC.
 */

import type { HttpRequestSpec, HttpResponseResult } from "./http";
import type { WttpError } from "./ipc";

export type ScriptPhase = "preRequest" | "tests";

export interface ScriptConsoleEntry {
  level: "log" | "warn" | "error";
  message: string;
  phase: ScriptPhase;
}

/** Uma chamada `test(name, fn)` — `message` só presente quando `passed: false`. */
export interface ScriptAssertion {
  name: string;
  passed: boolean;
  message?: string;
  durationMs: number;
}

/**
 * Payload de `script:run`. `req` é obrigatório (e mutável) na fase `preRequest`; `res`
 * é obrigatório (e congelada) na fase `tests` — docs/architecture.md §4/§5.
 */
export interface ScriptRunSpec {
  code: string;
  phase: ScriptPhase;
  /** Variáveis de runtime no início da execução — precedência máxima (EP-06-T01). */
  vars: Record<string, string>;
  req?: HttpRequestSpec;
  res?: HttpResponseResult;
  /** `wttp.yaml` → `settings.scriptTimeout`, default 5000ms. */
  timeoutMs?: number;
}

/**
 * Nunca rejeita a `invoke` por falha do script — `ok: false` é o resultado normal para
 * exceção não tratada ou timeout, do mesmo jeito que `HttpResponseResult.ok: false` é o
 * resultado normal de um erro de rede. `vars`/`console`/`assertions` vêm preenchidos
 * mesmo quando `ok: false`, com o que rodou até o ponto da falha.
 */
export interface ScriptRunResult {
  ok: boolean;
  vars: Record<string, string>;
  /** Só presente (e só relevante) na fase `preRequest` — a request como o script deixou. */
  req?: HttpRequestSpec;
  assertions: ScriptAssertion[];
  console: ScriptConsoleEntry[];
  error?: WttpError;
}

/**
 * Tipos da API de scripting (EP-09) — vocabulário compartilhado entre o runner isolado
 * no main (`src/main/scripts`), o IPC e a UI do renderer. A API exposta ao script do
 * usuário (`wttp.setVar/getVar`, `wttp.setCollectionVar/getCollectionVar`, `req`, `res`,
 * `test`, `expect`, `console.*`) está documentada em arch-docs/scripting.md; estes tipos são
 * só a forma que atravessa o IPC.
 */

import type { HttpRequestSpec, HttpResponseResult } from "./http";
import type { WttpError } from "./ipc";

export type ScriptPhase = "preRequest" | "tests" | "function";

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
 * é obrigatório (e congelada) na fase `tests` — arch-docs/architecture.md §4/§5.
 *
 * `wttp.setVar`/`getVar` gravam no environment ativo; `wttp.setCollectionVar`/
 * `getCollectionVar` gravam na collection (pasta raiz) da request — nenhum dos dois é
 * mais "runtime": o `runner.ts` não tem acesso a disco (isolado de propósito), então
 * quem chama `script:run` já traz o snapshot de cada escopo e recebe de volta o que o
 * script mudou, pra persistir depois (`useRequestTabsStore`).
 */
export interface ScriptRunSpec {
  code: string;
  phase: ScriptPhase;
  /**
   * Variáveis do environment ativo — nunca inclui o valor real de uma `secret: true`
   * (vem como `""`, mesma convenção do YAML em disco). `null` = nenhum environment
   * ativo; `wttp.setVar` vira falha de script nesse caso.
   */
  envVars: Record<string, string> | null;
  /** Nome do environment ativo, só para a mensagem de erro quando `envVars` é `null`. */
  activeEnvironmentName?: string;
  /**
   * Variáveis da collection (pasta raiz do workspace até a request) — `null` = a
   * request está na raiz do workspace, fora de qualquer collection; `wttp.setCollectionVar`
   * vira falha de script nesse caso.
   */
  collectionVars: Record<string, string> | null;
  /** Nome da collection, só para a mensagem de erro quando `collectionVars` é `null`. */
  collectionName?: string;
  req?: HttpRequestSpec;
  res?: HttpResponseResult;
  /**
   * Fase `function` (nó de função de um flow): as variáveis de runtime do flow — o script as
   * lê e escreve em `vars` — e quantas saídas o nó tem, para validar o que o código devolve.
   */
  vars?: Record<string, string>;
  outputs?: number;
  /** `wttp.yaml` → `settings.scriptTimeout`, default 5000ms. */
  timeoutMs?: number;
}

/**
 * Nunca rejeita a `invoke` por falha do script — `ok: false` é o resultado normal para
 * exceção não tratada ou timeout, do mesmo jeito que `HttpResponseResult.ok: false` é o
 * resultado normal de um erro de rede. `envVars`/`collectionVars`/`console`/`assertions`
 * vêm preenchidos mesmo quando `ok: false`, com o que rodou até o ponto da falha —
 * `null` quando o escopo correspondente também veio `null` no `spec` (nada a persistir).
 */
export interface ScriptRunResult {
  ok: boolean;
  envVars: Record<string, string> | null;
  collectionVars: Record<string, string> | null;
  /** Só presente (e só relevante) na fase `preRequest` — a request como o script deixou. */
  req?: HttpRequestSpec;
  /** Fase `function`: `vars` como o script deixou. */
  vars?: Record<string, string>;
  /** Fase `function`: a saída (1-based) que o código escolheu; `null` = nenhuma, o flow termina ali. */
  output?: number | null;
  assertions: ScriptAssertion[];
  console: ScriptConsoleEntry[];
  error?: WttpError;
}

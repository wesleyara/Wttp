/**
 * Collection Runner (EP-13) — vocabulário compartilhado entre o núcleo de execução
 * (`src/main/runner`, usado pela UI via IPC e pelo CLI `wttp run`) e o renderer.
 */

import type { HttpMethod } from "./http";
import type { WttpError } from "./ipc";
import type { ScriptAssertion, ScriptConsoleEntry } from "./scripting";

export interface RunCollectionOptions {
  /** Caminho absoluto da raiz do workspace. */
  root: string;
  /** Pasta ou collection a rodar, relativa à raiz — `""` roda o workspace inteiro. */
  targetPath: string;
  /**
   * Requests a rodar, na ordem desejada (paths relativos à raiz) — a lista que a tela
   * do runner deixa desmarcar/reordenar só para esta execução. Ausente = todas as
   * requests de `targetPath`, na ordem da árvore (`seq`).
   */
  selection?: string[];
  /** `path` do environment (arquivo em `environments/`) — `null` = sem environment. */
  environmentPath: string | null;
  /** Quantas vezes a lista inteira roda — mínimo 1. */
  iterations: number;
  /** Espera entre uma request e a próxima, em ms. */
  delayMs: number;
  /** Para na primeira request que falhar; sem isso, uma falha não interrompe as seguintes. */
  bail: boolean;
  /**
   * Grava no disco, ao fim do run, o que `wttp.setVar`/`setCollectionVar` mudaram — como
   * um envio avulso faz. Desligado, as mudanças só fluem entre as requests deste run.
   */
  persistVariables: boolean;
  /**
   * Valores que vencem qualquer camada (a de `runtime` do resolvedor) durante o run —
   * o `--var nome=valor` do CLI, para o CI trocar uma URL base sem editar o environment.
   */
  overrides?: Record<string, string>;
}

export type RunStartPayload = RunCollectionOptions;

export interface RunStartResult {
  runId: string;
}

/** Uma request do plano de execução, na ordem em que vai rodar. */
export interface RunPlanItem {
  path: string;
  name: string;
  method: HttpMethod;
}

export type RunAssertion = ScriptAssertion & { source: string };
export type RunConsoleEntry = ScriptConsoleEntry & { source: string };

export interface RunRequestResult {
  /** 1-based. */
  iteration: number;
  /** Posição no plano (0-based). */
  index: number;
  path: string;
  name: string;
  method: HttpMethod;
  /** URL como foi enviada (variáveis resolvidas, depois do pre-request). */
  url: string;
  /** `null` quando não houve resposta (erro de rede, pre-request falhou, cancelado). */
  status: number | null;
  durationMs: number;
  /** Resposta recebida, nenhum erro de script e toda asserção passou. */
  passed: boolean;
  /** Interrompida pelo "Stop" — não conta como falha no resumo. */
  cancelled: boolean;
  /** Erro de rede ou de pre-request (`source` = elo da cadeia de scripts que falhou). */
  error?: { source?: string; error: WttpError };
  assertions: RunAssertion[];
  console: RunConsoleEntry[];
  /** `{{var}}` que sobraram sem valor — a request vai com o texto literal, como o envio avulso confirmado. */
  unresolved: string[];
}

export interface RunSummary {
  /** Requests executadas até o fim (canceladas não contam). */
  total: number;
  passed: number;
  failed: number;
  assertions: { total: number; passed: number; failed: number };
  durationMs: number;
  /** Parou antes do fim: "stopped" = botão Stop/sinal; "bail" = primeira falha com `bail`. */
  endedEarly: "stopped" | "bail" | null;
}

export type RunEvent =
  | { runId: string; type: "started"; plan: RunPlanItem[]; iterations: number }
  | {
      runId: string;
      type: "requestStarted";
      iteration: number;
      index: number;
      path: string;
    }
  | { runId: string; type: "requestFinished"; result: RunRequestResult }
  | { runId: string; type: "finished"; summary: RunSummary }
  /** O run nem começou (workspace/environment inválido, seleção vazia...). */
  | { runId: string; type: "failed"; error: WttpError };

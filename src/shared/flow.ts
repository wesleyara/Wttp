/**
 * Flows (ClickLocal #57/#58/#59) — o arquivo `flows/*.flow.yaml` (arch-docs/file-format.md
 * §10) e o vocabulário de execução entre `src/main/flows` e o renderer.
 */

import type { Condition } from "./condition";
import type { WttpError } from "./ipc";
import type { RunAssertion, RunConsoleEntry, RunRequestResult } from "./runner";
import type { WorkspaceNodeIssue } from "./storage";

/** Versão do schema do `*.flow.yaml`. A v1 (#57) era uma lista linear de requests; a v2 (#59) tem nós de controle e arestas. */
export const FLOW_SCHEMA_VERSION = 2;

/** Teto de passos por execução quando o arquivo não pede outro — protege contra laço infinito. */
export const DEFAULT_MAX_FLOW_STEPS = 100;
export const MAX_FLOW_STEPS_LIMIT = 1000;
export const MIN_POLL_INTERVAL_MS = 1000;
export const MAX_POLL_ATTEMPTS = 1000;
export const MAX_DELAY_MS = 600_000;

export const MAX_FUNCTION_OUTPUTS = 10;

export type FlowNodeType = "request" | "condition" | "pollUntil" | "delay" | "function";

export interface FlowNode {
  /** Único no flow, `[A-Za-z0-9_-]+` — como as arestas e os mapeamentos citam o nó. */
  id: string;
  type: FlowNodeType;
  /** `request`: caminho da `*.req.yaml` relativo à raiz do workspace. Uma referência, nunca uma cópia. */
  request?: string;
  /** `condition` e `pollUntil`. */
  when?: Condition;
  /** `pollUntil`: espera entre tentativas, mínimo 1000. */
  intervalMs?: number;
  /** `pollUntil`: limite de tentativas, obrigatório. */
  maxAttempts?: number;
  /** `delay`: espera fixa. */
  ms?: number;
  /** `function`: quantas saídas o nó tem (1 a `MAX_FUNCTION_OUTPUTS`). */
  outputs?: number;
  /** `function`: o corpo da função JavaScript — roda isolado, devolve o número da saída a seguir. */
  code?: string;
  /** Posição no canvas; ausente = 0. */
  x?: number;
  y?: number;
}

/** Liga a saída de um nó à entrada de outro. Um nó `condition` tem duas saídas (`when: true`/`false`); um `function` tem `outputs` saídas (`output: 1..N`). */
export interface FlowEdge {
  from: string;
  to: string;
  when?: boolean;
  /** Saída de um nó `function` (1-based) de onde a aresta sai. */
  output?: number;
}

export interface FlowMapping {
  /** `<nó>.res.status` | `<nó>.res.headers.<Nome>` | `<nó>.res.body.<caminho>`. */
  from: string;
  /** Variável de runtime que recebe o valor. */
  to: string;
}

export interface FlowFile {
  wttp: number;
  name: string;
  /** Nó por onde a execução começa; ausente = o primeiro de `nodes`. */
  start?: string;
  nodes: FlowNode[];
  edges?: FlowEdge[];
  mappings?: FlowMapping[];
  /** Passos máximos por execução; ausente = `DEFAULT_MAX_FLOW_STEPS`. */
  maxSteps?: number;
  /** Campos que esta versão não conhece, preservados na regravação. */
  unknown?: Record<string, unknown>;
}

/** Um flow lido de `flows/`: `path` é o nome do arquivo dentro dela; `data` é `null` se inválido. */
export interface FlowListItem {
  path: string;
  name: string;
  data: FlowFile | null;
  issues?: WorkspaceNodeIssue[];
}

// --- IPC -------------------------------------------------------------------------------------

export interface FlowRootPayload {
  root: string;
}

export interface FlowPathPayload extends FlowRootPayload {
  /** Nome do arquivo em `flows/`. */
  path: string;
}

export interface CreateFlowPayload extends FlowRootPayload {
  name: string;
}

export interface SaveFlowPayload extends FlowPathPayload {
  flow: FlowFile;
}

export interface RenameFlowPayload extends FlowPathPayload {
  name: string;
}

export interface FlowRunPayload extends FlowPathPayload {
  /** `path` do environment ativo; `null` = nenhum. */
  environmentPath: string | null;
  /** Para no primeiro nó de request que falhar — o padrão, já que os nós seguintes costumam depender do anterior. */
  bail: boolean;
  delayMs: number;
  /** Roda este rascunho em vez do arquivo em disco — o canvas roda o que está na tela, salvo ou não. */
  flow?: FlowFile;
}

export interface FlowRunResult {
  runId: string;
}

/** Problema encontrado antes de rodar — o run nem começa. */
export interface FlowValidationIssue {
  /** `id` do nó, quando o problema é de um nó. */
  nodeId?: string;
  message: string;
}

export interface FlowPlanNode {
  id: string;
  type: FlowNodeType;
  /** `request`: o nome e o método da request. */
  request?: string;
  name?: string;
  method?: string;
}

export interface FlowVariable {
  name: string;
  value: string;
  /** Mapeamento que produziu o valor (`from`). */
  from: string;
}

/** O que a resposta de um nó de request deixou — a fonte das "portas de saída" do canvas. Corpo truncado. */
export interface FlowResponseSample {
  status: number;
  headers: { name: string; value: string }[];
  body: string;
  bodyTruncated: boolean;
}

export type FlowNodeOutcome = "true" | "false";

export interface FlowNodeResult {
  nodeId: string;
  type: FlowNodeType;
  /** Ordem de execução (1-based) — um nó que roda mais de uma vez aparece mais de uma vez. */
  step: number;
  passed: boolean;
  /** `request`: o resultado da request, no mesmo formato do Collection Runner. */
  result?: RunRequestResult;
  /** `request`: o que os mapeamentos deste nó gravaram nas variáveis de runtime. */
  produced: FlowVariable[];
  /** Mapeamento que não achou o valor — o nó conta como falho. */
  mappingErrors: string[];
  response?: FlowResponseSample;
  /** `condition`: por qual saída o flow seguiu. */
  outcome?: FlowNodeOutcome;
  /** `function`: a saída (1-based) que o código escolheu; `null` = nenhuma, o flow terminou ali. */
  output?: number | null;
  /** `pollUntil`: quantas vezes a condição foi avaliada. */
  attempts?: number;
  /** `delay`/`pollUntil`/`condition`: o que aconteceu, em uma linha. */
  message?: string;
  assertions?: RunAssertion[];
  console?: RunConsoleEntry[];
  durationMs: number;
}

export interface FlowRunSummary {
  /** Nós de request executados até o fim (canceladas não contam), re-execuções de poll incluídas. */
  total: number;
  passed: number;
  failed: number;
  assertions: { total: number; passed: number; failed: number };
  durationMs: number;
  /** "limit" = estourou o teto de passos; "bail" = um nó falhou com `bail`; "stopped" = botão Stop. */
  endedEarly: "stopped" | "bail" | "limit" | null;
  /** Explicação de `limit` e de uma falha de condição/poll. */
  message?: string;
}

export type FlowEvent =
  | { runId: string; type: "started"; nodes: FlowPlanNode[] }
  | { runId: string; type: "nodeStarted"; nodeId: string; step: number }
  | { runId: string; type: "nodeFinished"; node: FlowNodeResult }
  | { runId: string; type: "finished"; summary: FlowRunSummary }
  /** O run nem começou: flow inválido, referência quebrada, environment ausente. */
  | { runId: string; type: "failed"; error: WttpError; issues?: FlowValidationIssue[] };

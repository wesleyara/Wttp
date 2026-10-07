/**
 * Execução de um flow (ClickLocal #57/#59): percorre o grafo a partir do nó inicial. Cada
 * nó de request roda pelo mesmo `executeRequest` do Collection Runner (herança de auth →
 * `{{var}}` → pre-request → envio → tests), e depois da resposta os mapeamentos do nó gravam
 * variáveis na camada `runtime` do resolvedor — é assim que o token do login chega ao nó
 * seguinte sem script. Nós de controle decidem o caminho (condição), esperam (delay) ou
 * repetem o nó anterior (poll until), sempre com condições estruturadas — nunca código.
 * Um teto global de passos por execução interrompe um flow em laço.
 */

import type {
  FlowEvent,
  FlowFile,
  FlowNode,
  FlowNodeResult,
  FlowPlanNode,
  FlowResponseSample,
  FlowRunPayload,
  FlowRunSummary,
  FlowValidationIssue,
  FlowVariable,
  HttpResponseResult,
  RunAssertion,
  RunRequestResult,
  WorkspaceTree,
} from "@shared";

import { describeCondition, evaluateCondition, viewOfResponse } from "@shared/condition";
import { DEFAULT_MAX_FLOW_STEPS } from "@shared/flow";
import { extractValue, parseMappingSource } from "@shared/flowMapping";

import { DomainError, toWttpError } from "../ipc/errors";
import { executeRequest, type RunnerDeps, RunVariables } from "../runner/execute";
import { findRequest, type PlannedRequest } from "../runner/plan";
import { loadEnvironment } from "../runner/run";
import { serializeFlow } from "../storage/serializer";
import { scanWorkspace } from "../storage/tree";
import { validateFlow } from "../storage/validate";
import { startNodeId, validateFlowGraph } from "./graph";

type EventWithoutId = FlowEvent extends infer E
  ? E extends FlowEvent
    ? Omit<E, "runId">
    : never
  : never;

export interface FlowCallbacks {
  onEvent(event: EventWithoutId): void;
}

const MAX_SAMPLE_BYTES = 64 * 1024;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

function sampleOf(response: HttpResponseResult): FlowResponseSample | undefined {
  if (!response.ok) return undefined;
  const view = viewOfResponse(response);
  const truncated = view.body.length > MAX_SAMPLE_BYTES;
  return {
    status: view.status,
    headers: view.headers,
    body: truncated ? view.body.slice(0, MAX_SAMPLE_BYTES) : view.body,
    bodyTruncated: truncated,
  };
}

/** A última resposta de um nó de request — o que condições e polls avaliam. */
interface LastResponse {
  nodeId: string;
  response: HttpResponseResult | null;
  assertions: RunAssertion[];
}

/**
 * Roda o flow até o fim, até o primeiro nó que falhar (`bail`), até o teto de passos ou até
 * `signal` abortar — nunca lança: erro de preparação vira o evento `failed`, e o resumo chega
 * em `finished`.
 */
export async function runFlow(
  options: Omit<FlowRunPayload, "path"> & { root: string; path: string },
  deps: RunnerDeps,
  signal: AbortSignal,
  callbacks: FlowCallbacks,
): Promise<FlowRunSummary | null> {
  let tree: WorkspaceTree;
  let flow: FlowFile;
  let variables: RunVariables;
  const overrides: Record<string, string> = {};
  try {
    tree = await scanWorkspace(options.root);
    if (!tree.data) {
      throw new DomainError("ENOENT", "not a Wttp workspace (wttp.yaml missing)", options.root);
    }
    if (options.flow) {
      // O canvas roda o que está na tela: passa pelo mesmo validador do arquivo.
      const checked = validateFlow(serializeFlow(options.flow));
      if (!checked.valid) {
        throw new DomainError(
          "SCHEMA_INVALID",
          checked.issues[0]?.message ?? "the flow is invalid",
        );
      }
      flow = checked.value;
    } else {
      const item = tree.flows?.find(candidate => candidate.path === options.path);
      if (!item) throw new DomainError("ENOENT", `flow not found: "${options.path}"`, options.path);
      if (!item.data) {
        throw new DomainError(
          "SCHEMA_INVALID",
          item.issues?.[0]?.message ?? "the flow file is invalid",
          options.path,
        );
      }
      flow = item.data;
    }
    const issues: FlowValidationIssue[] = validateFlowGraph(tree, flow);
    if (issues.length > 0) {
      callbacks.onEvent({
        type: "failed",
        error: { code: "FLOW_INVALID", message: issues[0].message },
        issues,
      });
      return null;
    }
    const environment = await loadEnvironment(options.root, options.environmentPath, deps);
    variables = new RunVariables(environment, tree.data.variables ?? [], overrides);
  } catch (error) {
    callbacks.onEvent({ type: "failed", error: toWttpError(error) });
    return null;
  }

  const startedAt = Date.now();
  const scriptTimeoutMs = tree.data?.settings?.scriptTimeout;
  const maxSteps = flow.maxSteps ?? DEFAULT_MAX_FLOW_STEPS;
  const byId = new Map(flow.nodes.map(node => [node.id, node]));
  const planned = new Map<string, PlannedRequest>();
  for (const node of flow.nodes) {
    if (node.type === "request" && node.request) {
      const found = findRequest(tree, node.request);
      if (found) planned.set(node.id, found);
    }
  }
  const plan: FlowPlanNode[] = flow.nodes.map(node => {
    const request = planned.get(node.id);
    return {
      id: node.id,
      type: node.type,
      ...(request
        ? { request: node.request, name: request.node.name, method: request.node.data.method }
        : {}),
    };
  });
  callbacks.onEvent({ type: "started", nodes: plan });

  const next = (from: string, when?: boolean, output?: number): string | null =>
    flow.edges?.find(edge => edge.from === from && edge.when === when && edge.output === output)
      ?.to ?? null;

  const results: RunRequestResult[] = [];
  let endedEarly: FlowRunSummary["endedEarly"] = null;
  let message: string | undefined;
  let steps = 0;
  let last: LastResponse | null = null;

  /** Uma execução de um nó de request: envio, mapeamentos, resultado. */
  async function executeRequestNode(node: FlowNode, step: number): Promise<FlowNodeResult> {
    const started = Date.now();
    let received: HttpResponseResult | null = null;
    const result = await executeRequest(planned.get(node.id)!, variables, deps, {
      iteration: 1,
      index: step - 1,
      scriptTimeoutMs,
      signal,
      onResponse: response => {
        received = response;
      },
    });
    const response = received as HttpResponseResult | null;

    // Mapeamentos do nó, na ordem do arquivo, só depois de uma resposta de verdade.
    const produced: FlowVariable[] = [];
    const mappingErrors: string[] = [];
    for (const mapping of flow.mappings ?? []) {
      const source = parseMappingSource(mapping.from);
      if (!source || source.nodeId !== node.id) continue;
      if (!response?.ok) {
        mappingErrors.push(`${mapping.from} → ${mapping.to}: the request got no response`);
        continue;
      }
      const extracted = extractValue(source, viewOfResponse(response));
      if (!extracted.ok) {
        mappingErrors.push(`${mapping.from} → ${mapping.to}: ${extracted.message}`);
        continue;
      }
      overrides[mapping.to] = extracted.value;
      produced.push({ name: mapping.to, value: extracted.value, from: mapping.from });
    }

    // Um mapeamento sem valor reprova o nó — salvo quando o próximo nó é uma condição ou um
    // poll: aí quem decide o caminho é ele ("se criou segue por A, senão por B"), e o aviso
    // fica no resultado sem impedir o desvio.
    const following = next(node.id);
    const feedsControl =
      following !== null &&
      (byId.get(following)?.type === "condition" || byId.get(following)?.type === "pollUntil");
    const finished: RunRequestResult =
      mappingErrors.length > 0 && !result.cancelled && !feedsControl
        ? { ...result, passed: false }
        : result;
    results.push(finished);
    last = { nodeId: node.id, response, assertions: result.assertions };
    return {
      nodeId: node.id,
      type: "request",
      step,
      passed: finished.passed,
      result: finished,
      produced,
      mappingErrors,
      response: response ? sampleOf(response) : undefined,
      assertions: finished.assertions,
      console: finished.console,
      durationMs: Date.now() - started,
    };
  }

  const inputOf = (): {
    response: ReturnType<typeof viewOfResponse> | null;
    assertions: RunAssertion[];
  } | null => {
    const previous = last as LastResponse | null;
    if (!previous) return null;
    return {
      response: previous.response?.ok ? viewOfResponse(previous.response) : null,
      assertions: previous.assertions,
    };
  };

  let current = startNodeId(flow);
  while (current) {
    if (signal.aborted) {
      endedEarly = "stopped";
      break;
    }
    if (steps >= maxSteps) {
      endedEarly = "limit";
      message = `Flow stopped after ${maxSteps} steps — it may be looping. Check its connections, or raise "maxSteps" in the flow file.`;
      break;
    }
    const node = byId.get(current)!;
    steps++;
    callbacks.onEvent({ type: "nodeStarted", nodeId: node.id, step: steps });
    const started = Date.now();
    let nodeResult: FlowNodeResult;
    let following: string | null = null;

    if (node.type === "request") {
      nodeResult = await executeRequestNode(node, steps);
      following = next(node.id);
    } else if (node.type === "delay") {
      await sleep(node.ms ?? 0, signal);
      nodeResult = {
        nodeId: node.id,
        type: "delay",
        step: steps,
        passed: true,
        produced: [],
        mappingErrors: [],
        message: `waited ${node.ms ?? 0} ms`,
        durationMs: Date.now() - started,
      };
      following = next(node.id);
    } else if (node.type === "function") {
      // JavaScript do usuário: roda isolado (utilityProcess + vm, com timeout), como os scripts de request.
      const last_ = last as LastResponse | null;
      const result = await deps.runScript({
        code: node.code ?? "",
        phase: "function",
        envVars: variables.envVars,
        activeEnvironmentName: variables.environment?.file.name,
        collectionVars: null,
        res: last_?.response ?? undefined,
        vars: { ...overrides },
        outputs: node.outputs ?? 1,
        timeoutMs: scriptTimeoutMs,
      });
      variables.envVars = result.envVars;
      if (result.vars) {
        // O que a função deixou em `vars` passa a ser a camada de runtime do flow.
        for (const name of Object.keys(overrides))
          if (!(name in result.vars)) delete overrides[name];
        Object.assign(overrides, result.vars);
      }
      const output = result.ok ? (result.output ?? null) : null;
      nodeResult = {
        nodeId: node.id,
        type: "function",
        step: steps,
        passed: result.ok,
        produced: [],
        mappingErrors: [],
        output,
        message: !result.ok
          ? (result.error?.message ?? "the function failed")
          : output === null
            ? "returned no output — the flow ends here"
            : `followed output ${output}`,
        assertions: result.assertions.map(assertion => ({ ...assertion, source: node.id })),
        console: result.console.map(entry => ({ ...entry, source: node.id })),
        durationMs: Date.now() - started,
      };
      following = output === null ? null : next(node.id, undefined, output);
    } else if (node.type === "condition") {
      const input = inputOf();
      if (!input) {
        nodeResult = {
          nodeId: node.id,
          type: "condition",
          step: steps,
          passed: false,
          produced: [],
          mappingErrors: [],
          message: "no previous response to evaluate — put a request before this condition",
          durationMs: Date.now() - started,
        };
      } else {
        const matched = evaluateCondition(node.when!, input);
        nodeResult = {
          nodeId: node.id,
          type: "condition",
          step: steps,
          passed: true,
          produced: [],
          mappingErrors: [],
          outcome: matched ? "true" : "false",
          message: `${describeCondition(node.when!)} → ${matched}`,
          durationMs: Date.now() - started,
        };
        following = next(node.id, matched);
      }
    } else {
      // pollUntil: reexecuta o nó de request anterior até a condição bater.
      const previousId = (flow.edges ?? []).find(edge => edge.to === node.id)!.from;
      const previous = byId.get(previousId)!;
      const interval = node.intervalMs ?? 1000;
      const attempts = node.maxAttempts ?? 1;
      let attempt = 0;
      let matched = false;
      let stopReason: "limit" | "stopped" | null = null;
      while (!signal.aborted) {
        attempt++;
        const input = inputOf();
        matched = input ? evaluateCondition(node.when!, input) : false;
        if (matched || attempt >= attempts) break;
        await sleep(interval, signal);
        if (signal.aborted) break;
        if (steps >= maxSteps) {
          stopReason = "limit";
          break;
        }
        steps++;
        callbacks.onEvent({ type: "nodeStarted", nodeId: previous.id, step: steps });
        const rerun = await executeRequestNode(previous, steps);
        callbacks.onEvent({ type: "nodeFinished", node: rerun });
        if (rerun.result?.cancelled) break;
      }
      if (stopReason === "limit") {
        endedEarly = "limit";
        message = `Flow stopped after ${maxSteps} steps — it may be looping.`;
      }
      nodeResult = {
        nodeId: node.id,
        type: "pollUntil",
        step: steps,
        passed: matched,
        produced: [],
        mappingErrors: [],
        attempts: attempt,
        message: matched
          ? `${describeCondition(node.when!)} after ${attempt} attempt${attempt === 1 ? "" : "s"}`
          : `${describeCondition(node.when!)} was not met after ${attempt} attempt${attempt === 1 ? "" : "s"}`,
        durationMs: Date.now() - started,
      };
      following = next(node.id);
    }

    callbacks.onEvent({ type: "nodeFinished", node: nodeResult });

    if (endedEarly) break;
    if (signal.aborted || nodeResult.result?.cancelled) {
      endedEarly = "stopped";
      break;
    }
    if (
      !nodeResult.passed &&
      (options.bail || node.type === "condition" || node.type === "function")
    ) {
      endedEarly = "bail";
      message = nodeResult.message;
      break;
    }
    if (following && options.delayMs > 0) await sleep(options.delayMs, signal);
    current = following;
  }

  const done = results.filter(result => !result.cancelled);
  const allAssertions = done.flatMap(result => result.assertions);
  const summary: FlowRunSummary = {
    total: done.length,
    passed: done.filter(result => result.passed).length,
    failed: done.filter(result => !result.passed).length,
    assertions: {
      total: allAssertions.length,
      passed: allAssertions.filter(assertion => assertion.passed).length,
      failed: allAssertions.filter(assertion => !assertion.passed).length,
    },
    durationMs: Date.now() - startedAt,
    endedEarly,
    ...(message ? { message } : {}),
  };
  callbacks.onEvent({ type: "finished", summary });
  return summary;
}

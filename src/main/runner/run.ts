/**
 * Collection Runner (EP-13-T01): roda um plano de requests em sequência, N iterações,
 * com as variáveis fluindo entre elas (`RunVariables`), e emite um evento por passo.
 * Usado pela UI (`ipc/runner.ts`) e pelo CLI (`src/cli`) — os dois só mudam as
 * `RunnerDeps` (keychain × variáveis de ambiente; utility process × processo Node).
 */

import type {
  EnvironmentFile,
  FolderNode,
  RunCollectionOptions,
  RunEvent,
  RunPlanItem,
  RunRequestResult,
  RunSummary,
  WorkspaceTree,
} from "@shared";

import { DomainError, toWttpError } from "../ipc/errors";
import { getEnvironment, scanWorkspace, writeEnvironment, writeNode } from "../storage/tree";
import { executeRequest, type RunnerDeps, RunVariables } from "./execute";
import { buildPlan } from "./plan";

type EventWithoutId = RunEvent extends infer E
  ? E extends RunEvent
    ? Omit<E, "runId">
    : never
  : never;

export interface RunCallbacks {
  onEvent(event: EventWithoutId): void;
}

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

function validateOptions(options: RunCollectionOptions): void {
  if (
    !Number.isInteger(options.iterations) ||
    options.iterations < 1 ||
    options.iterations > 10_000
  ) {
    throw new DomainError("INVALID_PAYLOAD", "iterations must be an integer between 1 and 10000");
  }
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0 || options.delayMs > 3_600_000) {
    throw new DomainError("INVALID_PAYLOAD", "delay must be between 0 and 3600000 ms");
  }
}

/** Environment + valores reais dos segredos, lidos uma vez no começo do run. */
export async function loadEnvironment(
  root: string,
  path: string | null,
  deps: RunnerDeps,
): Promise<{ path: string; file: EnvironmentFile; secrets: Record<string, string> } | null> {
  if (!path) return null;
  const item = await getEnvironment(root, path);
  if (!item) throw new DomainError("ENOENT", `environment not found: "${path}"`, path);
  const secrets: Record<string, string> = {};
  for (const variable of item.data.variables ?? []) {
    if (!variable.secret) continue;
    secrets[variable.name] = (await deps.secretValue(path, variable.name)) ?? "";
  }
  return { path, file: item.data, secrets };
}

function sameRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  return aKeys.length === Object.keys(b).length && aKeys.every(key => a[key] === b[key]);
}

/**
 * Grava o que os scripts mudaram, com as mesmas regras do envio avulso
 * (`persistEnvVars`/`persistCollectionVars` em `requestTabs.ts`): variável `secret: true`
 * nunca é sobrescrita, e nada é escrito se nada mudou.
 */
async function persistVariables(
  root: string,
  tree: WorkspaceTree,
  variables: RunVariables,
): Promise<void> {
  const env = variables.environment;
  if (env && variables.envVars) {
    const existing = env.file.variables ?? [];
    const before = Object.fromEntries(existing.map(v => [v.name, v.secret ? "" : v.value]));
    if (!sameRecord(before, variables.envVars)) {
      const byName = new Map(existing.map(v => [v.name, v]));
      for (const [name, value] of Object.entries(variables.envVars)) {
        const current = byName.get(name);
        if (current?.secret) continue;
        byName.set(name, { ...current, name, value, enabled: current?.enabled ?? true });
      }
      await writeEnvironment(root, env.path, { ...env.file, variables: [...byName.values()] });
    }
  }

  for (const [path, vars] of variables.collectionVars) {
    const folder = tree.children.find(
      (node): node is FolderNode => node.kind === "folder" && node.path === path,
    );
    if (!folder?.data) continue;
    const existing = folder.data.variables ?? [];
    if (sameRecord(Object.fromEntries(existing.map(v => [v.name, v.value])), vars)) continue;
    const byName = new Map(existing.map(v => [v.name, v]));
    for (const [name, value] of Object.entries(vars)) {
      const current = byName.get(name);
      byName.set(name, { ...current, name, value, enabled: current?.enabled ?? true });
    }
    const data = { ...folder.data, variables: [...byName.values()] };
    await writeNode(root, path, { ...folder, data, children: [] });
  }
}

/**
 * Roda até o fim, até a primeira falha (`bail`) ou até `signal` abortar — nunca lança:
 * erro de preparação vira evento `failed`, e o resumo sempre chega em `finished`.
 */
export async function runCollection(
  options: RunCollectionOptions,
  deps: RunnerDeps,
  signal: AbortSignal,
  callbacks: RunCallbacks,
): Promise<RunSummary | null> {
  let tree: WorkspaceTree;
  let variables: RunVariables;
  let plan: ReturnType<typeof buildPlan>;
  try {
    validateOptions(options);
    tree = await scanWorkspace(options.root);
    if (!tree.data)
      throw new DomainError("ENOENT", "not a Wttp workspace (wttp.yaml missing)", options.root);
    plan = buildPlan(tree, options.targetPath, options.selection);
    if (plan.length === 0)
      throw new DomainError("INVALID_PAYLOAD", "nothing to run: no requests selected");
    const environment = await loadEnvironment(options.root, options.environmentPath, deps);
    variables = new RunVariables(environment, tree.data.variables ?? [], options.overrides);
  } catch (error) {
    callbacks.onEvent({ type: "failed", error: toWttpError(error) });
    return null;
  }

  const startedAt = Date.now();
  const scriptTimeoutMs = tree.data?.settings?.scriptTimeout;
  const planItems: RunPlanItem[] = plan.map(item => ({
    path: item.node.path,
    name: item.node.name,
    method: item.node.data.method,
  }));
  callbacks.onEvent({ type: "started", plan: planItems, iterations: options.iterations });

  const results: RunRequestResult[] = [];
  let endedEarly: RunSummary["endedEarly"] = null;
  let first = true;

  outer: for (let iteration = 1; iteration <= options.iterations; iteration++) {
    for (let index = 0; index < plan.length; index++) {
      if (!first) await sleep(options.delayMs, signal);
      first = false;
      if (signal.aborted) {
        endedEarly = "stopped";
        break outer;
      }

      const item = plan[index];
      callbacks.onEvent({ type: "requestStarted", iteration, index, path: item.node.path });
      const result = await executeRequest(item, variables, deps, {
        iteration,
        index,
        scriptTimeoutMs,
        signal,
      });
      results.push(result);
      callbacks.onEvent({ type: "requestFinished", result });

      if (result.cancelled || signal.aborted) {
        endedEarly = "stopped";
        break outer;
      }
      if (!result.passed && options.bail) {
        endedEarly = "bail";
        break outer;
      }
    }
  }

  if (options.persistVariables) {
    try {
      await persistVariables(options.root, tree, variables);
    } catch (error) {
      // O run já aconteceu — não perder o resumo por causa da gravação; o erro vai para o
      // console do main, e a próxima execução/o envio avulso relê do disco.
      console.error("wttp: failed to persist runner variables", error);
    }
  }

  const finished = results.filter(result => !result.cancelled);
  const allAssertions = finished.flatMap(result => result.assertions);
  const summary: RunSummary = {
    total: finished.length,
    passed: finished.filter(result => result.passed).length,
    failed: finished.filter(result => !result.passed).length,
    assertions: {
      total: allAssertions.length,
      passed: allAssertions.filter(assertion => assertion.passed).length,
      failed: allAssertions.filter(assertion => !assertion.passed).length,
    },
    durationMs: Date.now() - startedAt,
    endedEarly,
  };
  callbacks.onEvent({ type: "finished", summary });
  return summary;
}

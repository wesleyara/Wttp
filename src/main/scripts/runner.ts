/**
 * Gerência do utility process de scripts (EP-09-T01) — arch-docs/architecture.md §5.
 *
 * Único ponto do main que sabe que o runner existe. Mantém um `UtilityProcess`
 * reciclado entre execuções, mata e respawna em timeout ou crash, e nunca deixa uma
 * chamada a `runScript` pendurada — toda promise resolve (nunca rejeita: falha de
 * script é `ok: false`, não uma exceção do IPC).
 */

import type { ScriptRunResult, ScriptRunSpec } from "@shared";
import type { UtilityProcess } from "electron";

import { utilityProcess } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 5000;
/** Folga além do timeout do próprio `vm` — cobre o caso do processo travar fora do vm.Script (ex. num handler nativo). */
const KILL_GRACE_MS = 500;

interface PendingRun {
  resolve: (result: ScriptRunResult) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

let worker: UtilityProcess | null = null;
const pending = new Map<string, PendingRun>();

function crashedResult(): ScriptRunResult {
  return {
    ok: false,
    envVars: null,
    collectionVars: null,
    assertions: [],
    console: [],
    error: { code: "UNKNOWN", message: "Script runner crashed" },
  };
}

function timeoutResult(timeoutMs: number): ScriptRunResult {
  return {
    ok: false,
    envVars: null,
    collectionVars: null,
    assertions: [],
    console: [],
    error: { code: "SCRIPT_TIMEOUT", message: `Script exceeded ${timeoutMs}ms timeout` },
  };
}

function settleAllPending(result: ScriptRunResult): void {
  for (const run of pending.values()) {
    clearTimeout(run.timeoutHandle);
    run.resolve(result);
  }
  pending.clear();
}

function spawnWorker(): UtilityProcess {
  const workerPath = path.join(__dirname, "scripts", "worker.js");
  const child = utilityProcess.fork(workerPath, [], { stdio: "pipe" });

  child.on("exit", () => {
    if (worker === child) worker = null;
    settleAllPending(crashedResult());
  });

  child.on("message", (message: { id: string; result: ScriptRunResult }) => {
    const run = pending.get(message.id);
    if (!run) return;
    clearTimeout(run.timeoutHandle);
    pending.delete(message.id);
    run.resolve(message.result);
  });

  return child;
}

function killWorker(): void {
  worker?.kill();
  worker = null;
}

/** Nunca rejeita: timeout, crash e exceção de script viram `ScriptRunResult.ok: false`. */
export function runScript(spec: ScriptRunSpec): Promise<ScriptRunResult> {
  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!worker) worker = spawnWorker();
  const id = randomUUID();

  return new Promise(resolve => {
    const timeoutHandle = setTimeout(() => {
      pending.delete(id);
      killWorker();
      resolve(timeoutResult(timeoutMs));
    }, timeoutMs + KILL_GRACE_MS);

    pending.set(id, { resolve, timeoutHandle });
    worker!.postMessage({ id, spec });
  });
}

/** Só para testes — força o próximo `runScript` a spawnar um worker novo. */
export function resetScriptRunnerForTests(): void {
  killWorker();
  settleAllPending(crashedResult());
}

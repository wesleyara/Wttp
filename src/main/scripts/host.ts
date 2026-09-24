/**
 * Host do processo isolado de scripts (EP-09-T01) — arch-docs/architecture.md §5 —
 * independente de *como* o processo nasce: no app é um `utilityProcess` do Electron
 * (`runner.ts`), no CLI `wttp run` é um `child_process.fork` do Node (EP-13-T02). Mesmo
 * contrato nos dois: um processo reciclado entre execuções, morto e respawnado em
 * timeout ou crash, e nenhuma chamada pendurada — `run` nunca rejeita, falha de script
 * é `ok: false`.
 */

import type { ScriptRunResult, ScriptRunSpec } from "@shared";

import { randomUUID } from "node:crypto";

export const DEFAULT_SCRIPT_TIMEOUT_MS = 5000;
/** Folga além do timeout do próprio `vm` — cobre o caso do processo travar fora do vm.Script (ex. num handler nativo). */
const KILL_GRACE_MS = 500;

/** O mínimo que o host precisa do processo filho — `UtilityProcess` já tem esse formato; um `ChildProcess` do Node, adaptado (`send` → `postMessage`). */
export interface ScriptWorkerProcess {
  on(
    event: "message",
    listener: (message: { id: string; result: ScriptRunResult }) => void,
  ): unknown;
  on(event: "exit", listener: () => void): unknown;
  postMessage(message: { id: string; spec: ScriptRunSpec }): void;
  kill(): unknown;
}

export interface ScriptHost {
  run(spec: ScriptRunSpec): Promise<ScriptRunResult>;
  /** Mata o processo (se houver) e resolve o que estava pendente como crash — o próximo `run` spawna outro. */
  reset(): void;
}

interface PendingRun {
  resolve: (result: ScriptRunResult) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

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

export function createScriptHost(spawn: () => ScriptWorkerProcess): ScriptHost {
  let worker: ScriptWorkerProcess | null = null;
  const pending = new Map<string, PendingRun>();

  function settleAllPending(result: ScriptRunResult): void {
    for (const run of pending.values()) {
      clearTimeout(run.timeoutHandle);
      run.resolve(result);
    }
    pending.clear();
  }

  function spawnWorker(): ScriptWorkerProcess {
    const child = spawn();

    child.on("exit", () => {
      if (worker === child) worker = null;
      settleAllPending(crashedResult());
    });

    child.on("message", message => {
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

  return {
    run(spec) {
      const timeoutMs = spec.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS;
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
    },
    reset() {
      killWorker();
      settleAllPending(crashedResult());
    },
  };
}

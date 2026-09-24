/**
 * Runner de scripts do app (EP-09-T01) — arch-docs/architecture.md §5: o host genérico
 * (`host.ts`) sobre um `utilityProcess` do Electron. Único ponto do main que sabe que o
 * processo de scripts existe; o CLI `wttp run` usa o mesmo host sobre `child_process`.
 */

import type { ScriptRunResult, ScriptRunSpec } from "@shared";

import { utilityProcess } from "electron";
import path from "node:path";

import { createScriptHost } from "./host";

const host = createScriptHost(() =>
  utilityProcess.fork(path.join(__dirname, "scripts", "worker.js"), [], { stdio: "pipe" }),
);

/** Nunca rejeita: timeout, crash e exceção de script viram `ScriptRunResult.ok: false`. */
export function runScript(spec: ScriptRunSpec): Promise<ScriptRunResult> {
  return host.run(spec);
}

/** Só para testes — força o próximo `runScript` a spawnar um worker novo. */
export function resetScriptRunnerForTests(): void {
  host.reset();
}

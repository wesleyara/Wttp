/**
 * Entry point do utility process (EP-09-T01) — arch-docs/architecture.md §5.
 *
 * Compilado como um bundle separado (ver `electron.vite.config.ts`) e spawnado por
 * `runner.ts` via `utilityProcess.fork`. Só faz a ponte entre `process.parentPort` e
 * `executeScript` — nenhuma lógica própria, o que deixa a API de scripting testável
 * sem subir um utility process de verdade (`api.spec.ts`).
 *
 * Deliberadamente não importa `node:fs`, `node:net`, `node:child_process` nem nada do
 * `electron` — o processo em si já não tem privilégios além do que o SO dá a qualquer
 * processo Node, mas não há motivo para ampliar a superfície.
 */

import type { ScriptRunSpec } from "@shared";

import { executeScript } from "./api";

interface RunMessage {
  id: string;
  spec: ScriptRunSpec;
}

process.parentPort.on("message", ({ data }: { data: RunMessage }) => {
  const result = executeScript(data.spec);
  process.parentPort.postMessage({ id: data.id, result });
});

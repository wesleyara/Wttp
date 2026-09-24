/**
 * Entry point do processo isolado de scripts (EP-09-T01) — arch-docs/architecture.md §5.
 *
 * Compilado como um bundle separado e spawnado pelo host (`host.ts`): no app via
 * `utilityProcess.fork` (canal `process.parentPort`, ver `electron.vite.config.ts`), no
 * CLI `wttp run` via `child_process.fork` (canal IPC do Node, `process.send`). Só faz a
 * ponte entre o canal e `executeScript` — nenhuma lógica própria, o que deixa a API de
 * scripting testável sem subir processo nenhum (`api.spec.ts`).
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

// `parentPort` só existe dentro de um `utilityProcess` do Electron; no Node puro é
// `undefined`, apesar do tipo que o Electron acrescenta ao `process`.
const parentPort = (process as { parentPort?: Electron.ParentPort }).parentPort;

if (parentPort) {
  parentPort.on("message", ({ data }: { data: RunMessage }) => {
    parentPort.postMessage({ id: data.id, result: executeScript(data.spec) });
  });
} else {
  process.on("message", (data: RunMessage) => {
    process.send?.({ id: data.id, result: executeScript(data.spec) });
  });
}

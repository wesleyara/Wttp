/**
 * Binário `wttp` (EP-13-T02) — empacotado por `vite.cli.config.ts` em `cli/dist/wttp.mjs`,
 * com o worker de scripts ao lado (`cli/dist/script-worker.mjs`). Node puro: roda num
 * container de CI sem display e sem Electron.
 */

import { fork } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { cancelHttpRequest, sendHttpRequest } from "../main/http/engine";
import { createScriptHost, type ScriptWorkerProcess } from "../main/scripts/host";
import { runCli } from "./cli";

declare const __WTTP_CLI_VERSION__: string;

const workerPath = fileURLToPath(new URL("./script-worker.mjs", import.meta.url));

// Mesmo isolamento do app: um processo à parte, só com `node:vm` e o que a API de
// scripting expõe — o `execArgv` vazio não herda flags de debug/inspeção do pai.
const scripts = createScriptHost((): ScriptWorkerProcess => {
  const child = fork(workerPath, [], {
    execArgv: [],
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    // Structured clone, como o `utilityProcess` do app: o padrão (JSON) transformaria o
    // body `Uint8Array` da resposta num objeto `{ "0": …, "1": … }` a caminho do worker.
    serialization: "advanced",
  });
  return {
    on: (event: "message" | "exit", listener: (...args: never[]) => void) =>
      child.on(event, listener as (...args: unknown[]) => void),
    postMessage: message => void child.send(message),
    kill: () => child.kill(),
  };
});

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

const code = await runCli(process.argv.slice(2), {
  stdout: text => void process.stdout.write(text),
  stderr: text => void process.stderr.write(text),
  env: process.env,
  cwd: process.cwd(),
  color: Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined,
  deps: {
    send: spec => sendHttpRequest(spec),
    cancel: requestId => void cancelHttpRequest(requestId),
    runScript: spec => scripts.run(spec),
  },
  writeFile: (path, contents) => writeFile(path, contents, "utf-8"),
  version: __WTTP_CLI_VERSION__,
  signal: controller.signal,
});

scripts.reset();
process.exitCode = code;
// Agents HTTP com keep-alive seguram o event loop — o run acabou, não há o que esperar.
setTimeout(() => process.exit(code), 50).unref();

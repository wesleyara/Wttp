import type { RunStartPayload } from "@shared";

import { randomUUID } from "node:crypto";

import { cancelHttpRequest, sendHttpRequest } from "../http/engine";
import { runCollection } from "../runner/run";
import { runScript } from "../scripts/runner";
import { getSecret } from "../secrets/store";
import { buildSecretKey } from "../storage/environments";
import { resolveWorkspacePath } from "../storage/paths";
import { DomainError } from "./errors";
import { registerHandler } from "./registry";

/** Runs em andamento, por `runId` — é o que `runner:stop` aborta. */
const running = new Map<string, AbortController>();

function assertStartPayload(payload: RunStartPayload): void {
  if (!payload || typeof payload.root !== "string" || typeof payload.targetPath !== "string") {
    throw new DomainError("INVALID_PAYLOAD", "runner:start needs a root and a target path");
  }
  // Mesmo guarda de `node:*`: o alvo e cada request da seleção ficam dentro da raiz.
  resolveWorkspacePath(payload.root, payload.targetPath);
  for (const path of payload.selection ?? []) resolveWorkspacePath(payload.root, path);
}

export function registerRunnerHandlers(): void {
  registerHandler("runner:start", (payload, event) => {
    assertStartPayload(payload);
    const runId = randomUUID();
    const controller = new AbortController();
    running.set(runId, controller);

    // Não aguarda: o renderer acompanha por `runner:event` e pode parar com `runner:stop`.
    void runCollection(
      payload,
      {
        send: spec => sendHttpRequest(spec),
        cancel: requestId => void cancelHttpRequest(requestId),
        runScript,
        secretValue: (envPath, name) =>
          getSecret(payload.root, buildSecretKey(payload.root, envPath, name)),
      },
      controller.signal,
      {
        onEvent: runEvent => {
          if (!event.sender.isDestroyed())
            event.sender.send("runner:event", { runId, ...runEvent });
        },
      },
    ).finally(() => running.delete(runId));

    return { runId };
  });

  registerHandler("runner:stop", runId => {
    running.get(runId)?.abort();
  });
}

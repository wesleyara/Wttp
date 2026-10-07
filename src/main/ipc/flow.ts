import type { FlowEvent, FlowRootPayload } from "@shared";

import { randomUUID } from "node:crypto";

import { runFlow } from "../flows/run";
import { cancelHttpRequest, sendHttpRequest } from "../http/engine";
import { runScript } from "../scripts/runner";
import { getSecret } from "../secrets/store";
import { buildSecretKey } from "../storage/environments";
import { createFlow, deleteFlow, renameFlow, writeFlow } from "../storage/flows";
import { DomainError } from "./errors";
import { registerHandler } from "./registry";

/** Runs em andamento, por `runId` — é o que `flow:stop` aborta. */
const running = new Map<string, AbortController>();

function assertRoot(payload: FlowRootPayload): void {
  if (!payload || typeof payload.root !== "string" || payload.root.length === 0) {
    throw new DomainError("INVALID_PAYLOAD", "flow channels need the workspace root");
  }
}

export function registerFlowHandlers(): void {
  registerHandler("flow:create", payload => {
    assertRoot(payload);
    if (typeof payload.name !== "string" || payload.name.trim() === "") {
      throw new DomainError("INVALID_PAYLOAD", "flow:create needs a name");
    }
    return createFlow(payload.root, payload.name.trim());
  });
  registerHandler("flow:save", payload => {
    assertRoot(payload);
    return writeFlow(payload.root, payload.path, payload.flow);
  });
  registerHandler("flow:rename", payload => {
    assertRoot(payload);
    if (typeof payload.name !== "string" || payload.name.trim() === "") {
      throw new DomainError("INVALID_PAYLOAD", "flow:rename needs a name");
    }
    return renameFlow(payload.root, payload.path, payload.name.trim());
  });
  registerHandler("flow:delete", payload => {
    assertRoot(payload);
    return deleteFlow(payload.root, payload.path);
  });

  registerHandler("flow:run", (payload, event) => {
    assertRoot(payload);
    if (typeof payload.path !== "string" || !payload.path.endsWith(".flow.yaml")) {
      throw new DomainError("INVALID_PAYLOAD", "flow:run needs the flow path");
    }
    const runId = randomUUID();
    const controller = new AbortController();
    running.set(runId, controller);

    // Não aguarda: o renderer acompanha por `flow:event` e pode parar com `flow:stop`.
    void runFlow(
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
        onEvent: flowEvent => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("flow:event", { runId, ...flowEvent } satisfies FlowEvent);
          }
        },
      },
    ).finally(() => running.delete(runId));

    return { runId };
  });

  registerHandler("flow:stop", runId => {
    running.get(runId)?.abort();
  });
}

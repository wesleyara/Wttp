import type { WebSocketConnectSpec } from "@shared";

import { prepareConnection } from "../websocket/prepare";
import {
  closeAllSessionsFor,
  closeSession,
  connectSession,
  sendMessage,
  WebSocketSessionError,
} from "../websocket/session";
import { DomainError } from "./errors";
import { registerHandler } from "./registry";

function sessionError(error: unknown): unknown {
  if (error instanceof WebSocketSessionError)
    return new DomainError("INVALID_PAYLOAD", error.message);
  return error;
}

function assertSessionId(id: unknown): asserts id is string {
  if (typeof id !== "string" || id.length === 0) {
    throw new DomainError("INVALID_PAYLOAD", "websocket channels need a session id");
  }
}

const watchedSenders = new WeakSet<object>();

export function registerWebSocketHandlers(): void {
  registerHandler("ws:connect", (spec: WebSocketConnectSpec, event) => {
    assertSessionId(spec?.sessionId);
    const sender = event.sender;
    // Janela destruída leva as conexões junto; sem isso o socket sobreviveria ao dono.
    if (!watchedSenders.has(sender)) {
      watchedSenders.add(sender);
      sender.once("destroyed", () => closeAllSessionsFor(sender));
    }
    try {
      connectSession(prepareConnection(spec), sender, wsEvent => {
        if (!sender.isDestroyed()) sender.send("ws:event", wsEvent);
      });
    } catch (error) {
      throw sessionError(error);
    }
  });

  registerHandler("ws:send", (payload, event) => {
    assertSessionId(payload?.sessionId);
    try {
      sendMessage(payload.sessionId, event.sender, String(payload.data));
    } catch (error) {
      throw sessionError(error);
    }
  });

  registerHandler("ws:close", (sessionId, event) => {
    assertSessionId(sessionId);
    closeSession(sessionId, event.sender);
  });
}

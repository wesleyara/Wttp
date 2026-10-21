/**
 * Conexão WebSocket (ClickLocal #476) — vocabulário compartilhado entre o cliente no
 * main (`src/main/websocket`) e a UI. O ciclo de vida da conexão mora no main; o
 * renderer comanda por `ws:connect`/`ws:send`/`ws:close` e acompanha por `ws:event`.
 * Formato em disco: arch-docs/file-format.md §10.
 */

import type { AuthConfig, KeyValueEntry } from "./http";
import type { WebSocketReconnectConfig } from "./storage";

/**
 * Conexão pronta, como `HttpRequestSpec`: variáveis já resolvidas, `auth` concreta (nunca
 * `inherit`). O main aplica `auth` e `query` (`prepareConnection`) antes de abrir o socket.
 */
export interface WebSocketConnectSpec {
  /** Id da sessão, escolhido pelo renderer (o id da aba) — uma conexão por id. */
  sessionId: string;
  url: string;
  query: KeyValueEntry[];
  headers: KeyValueEntry[];
  auth: AuthConfig;
  subprotocols: string[];
  reconnect: Required<WebSocketReconnectConfig>;
}

export interface WebSocketSendPayload {
  sessionId: string;
  data: string;
}

export type WebSocketState = "connecting" | "open" | "reconnecting" | "closed";

export type WebSocketEvent =
  | { sessionId: string; type: "state"; state: WebSocketState; attempt?: number }
  | { sessionId: string; type: "open"; protocol: string }
  | { sessionId: string; type: "message"; data: string; size: number; at: number }
  | { sessionId: string; type: "sent"; data: string; size: number; at: number }
  | {
      sessionId: string;
      type: "close";
      code: number;
      reason: string;
      wasClean: boolean;
      at: number;
    }
  | { sessionId: string; type: "error"; message: string; at: number };

/** Uma linha do histórico da sessão (só em memória — não é versionado). */
export interface WebSocketLogEntry {
  id: number;
  at: number;
  direction: "in" | "out" | "system";
  data: string;
  size: number;
}

import type { KeyValueEntry, WebSocketConnectSpec } from "@shared";

import { applyAuth } from "../http/auth";

/** A conexão como vai para a rede: URL final (com query) e headers já com a auth aplicada. */
export interface PreparedConnection {
  sessionId: string;
  url: string;
  headers: KeyValueEntry[];
  subprotocols: string[];
  reconnect: WebSocketConnectSpec["reconnect"];
}

/**
 * Aplica `auth` e `query` ao spec do renderer — a mesma `applyAuth` do HTTP, para o
 * `Authorization` manual vencer o `bearer`/`basic` e a API key em `query` funcionar igual.
 * A tabela de query substitui a query string da URL (é a fonte da verdade, como na engine).
 * URL que não parseia é devolvida como veio; `connectSession` recusa com mensagem clara.
 */
export function prepareConnection(spec: WebSocketConnectSpec): PreparedConnection {
  const authed = applyAuth({
    requestId: spec.sessionId,
    method: "GET",
    url: spec.url,
    query: spec.query,
    headers: spec.headers,
    auth: spec.auth,
    body: { type: "none" },
  });

  let url = spec.url;
  try {
    const parsed = new URL(spec.url);
    parsed.search = "";
    for (const entry of authed.query) {
      if (entry.enabled && entry.name !== "") parsed.searchParams.append(entry.name, entry.value);
    }
    url = parsed.toString();
  } catch {
    // validada em connectSession
  }

  return {
    sessionId: spec.sessionId,
    url,
    headers: authed.headers,
    subprotocols: spec.subprotocols.map(item => item.trim()).filter(item => item !== ""),
    reconnect: spec.reconnect,
  };
}

import type {
  AuthConfig,
  WebSocketConfig,
  WebSocketEvent,
  WebSocketLogEntry,
  WebSocketState,
} from "@shared";

import { i18n } from "@renderer/i18n";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useToastStore } from "@renderer/stores/toast";
import { defineStore } from "pinia";
import { reactive } from "vue";

/** Teto de linhas por sessão — a mais antiga sai primeiro, para uma conexão tagarela não encher a memória. */
export const MAX_LOG_ENTRIES = 5000;

export type WebSocketDirectionFilter = "all" | "in" | "out";

export interface WebSocketSessionState {
  state: WebSocketState;
  /** Tentativa de reconexão em curso (1-based) — só faz sentido em `reconnecting`/`connecting`. */
  attempt: number;
  /** Subprotocolo negociado no handshake (vazio = nenhum). */
  protocol: string;
  log: WebSocketLogEntry[];
  nextId: number;
  filterText: string;
  filterDirection: WebSocketDirectionFilter;
}

function emptySession(): WebSocketSessionState {
  return {
    state: "closed",
    attempt: 0,
    protocol: "",
    log: [],
    nextId: 1,
    filterText: "",
    filterDirection: "all",
  };
}

/** Defaults de `websocket.reconnect` (arch-docs/file-format.md §10). */
export function reconnectSettings(config: WebSocketConfig): {
  enabled: boolean;
  maxAttempts: number;
  delayMs: number;
} {
  return {
    enabled: config.reconnect?.enabled ?? false,
    maxAttempts: Math.max(0, config.reconnect?.maxAttempts ?? 5),
    delayMs: Math.max(0, config.reconnect?.delayMs ?? 1000),
  };
}

/** Linhas visíveis sob o filtro de direção e de texto (sem diferenciar maiúsculas). Eventos de sistema sempre passam no filtro de direção. */
export function filterLog(
  log: readonly WebSocketLogEntry[],
  text: string,
  direction: WebSocketDirectionFilter,
): WebSocketLogEntry[] {
  const needle = text.trim().toLowerCase();
  return log.filter(entry => {
    if (direction !== "all" && entry.direction !== "system" && entry.direction !== direction) {
      return false;
    }
    return needle === "" || entry.data.toLowerCase().includes(needle);
  });
}

/**
 * Conexões WebSocket por aba (ClickLocal #476). O ciclo de vida mora no main; esta store
 * só comanda (`ws:connect`/`send`/`close`) e acumula o histórico da sessão em memória —
 * nada disso é versionado, fechar a aba descarta (arch-docs/file-format.md §10).
 */
export const useWebSocketStore = defineStore("websocket", () => {
  const tabs = useRequestTabsStore();
  const toast = useToastStore();
  const { t } = i18n.global;

  const sessions = reactive<Record<string, WebSocketSessionState>>({});

  function sessionFor(tabId: string): WebSocketSessionState {
    if (!sessions[tabId]) sessions[tabId] = emptySession();
    return sessions[tabId];
  }

  function appendLog(
    session: WebSocketSessionState,
    direction: WebSocketLogEntry["direction"],
    data: string,
    size: number,
    at: number,
  ): void {
    session.log.push({ id: session.nextId++, at, direction, data, size });
    if (session.log.length > MAX_LOG_ENTRIES) {
      session.log.splice(0, session.log.length - MAX_LOG_ENTRIES);
    }
  }

  function handleEvent(event: WebSocketEvent): void {
    const session = sessionFor(event.sessionId);
    switch (event.type) {
      case "state":
        session.state = event.state;
        session.attempt = event.attempt ?? 0;
        if (event.state === "reconnecting") {
          appendLog(
            session,
            "system",
            t("websocket.log.reconnecting", { attempt: event.attempt ?? 0 }),
            0,
            Date.now(),
          );
        }
        break;
      case "open":
        session.protocol = event.protocol;
        appendLog(
          session,
          "system",
          event.protocol
            ? t("websocket.log.connectedWith", { protocol: event.protocol })
            : t("websocket.log.connected"),
          0,
          Date.now(),
        );
        break;
      case "message":
        appendLog(session, "in", event.data, event.size, event.at);
        break;
      case "sent":
        appendLog(session, "out", event.data, event.size, event.at);
        break;
      case "close":
        appendLog(
          session,
          "system",
          t("websocket.log.closed", {
            code: event.code,
            reason: event.reason || t("websocket.log.noReason"),
          }),
          0,
          event.at,
        );
        break;
      case "error":
        appendLog(
          session,
          "system",
          t("websocket.log.error", { message: event.message }),
          0,
          event.at,
        );
        break;
    }
  }

  window.wttp.ws.onEvent(handleEvent);

  /** Resolve `{{var}}` e auth herdada como o Send faz e abre a conexão; variável não resolvida bloqueia com aviso. */
  async function connect(tabId: string): Promise<void> {
    const tab = tabs.requestTabById(tabId);
    if (!tab || tab.protocol !== "websocket") return;
    const session = sessionFor(tabId);
    if (session.state === "connecting" || session.state === "open") return;

    if (tab.url.trim() === "") {
      toast.push(t("websocket.toast.urlRequired"), "warning");
      return;
    }

    const resolved = await tabs.resolveTabRequest(tab);
    if (resolved.unresolved.length > 0) {
      toast.push(
        t("websocket.toast.unresolved", { names: resolved.unresolved.join(", ") }),
        "warning",
      );
      return;
    }

    const config: WebSocketConfig = JSON.parse(JSON.stringify(tab.websocket));
    session.protocol = "";
    try {
      await window.wttp.ws.connect({
        sessionId: tabId,
        url: resolved.url,
        query: resolved.query,
        headers: resolved.headers,
        auth: resolved.auth as AuthConfig,
        subprotocols: config.subprotocols ?? [],
        reconnect: reconnectSettings(config),
      });
    } catch (error) {
      session.state = "closed";
      appendLog(
        session,
        "system",
        t("websocket.log.error", { message: errorMessage(error) }),
        0,
        Date.now(),
      );
      toast.push(errorMessage(error), "error");
    }
  }

  function errorMessage(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
      return String((error as { message: unknown }).message);
    }
    return String(error);
  }

  async function disconnect(tabId: string): Promise<void> {
    await window.wttp.ws.close(tabId);
  }

  /** Conectado/conectando/reconectando → desconecta; fechado → conecta. */
  function toggle(tabId: string): void {
    if (sessionFor(tabId).state === "closed") void connect(tabId);
    else void disconnect(tabId);
  }

  /** Devolve `true` quando a mensagem saiu; falha (desconectado) vira toast e `false`. */
  async function send(tabId: string, data: string): Promise<boolean> {
    try {
      await window.wttp.ws.send(tabId, data);
      return true;
    } catch (error) {
      toast.push(errorMessage(error), "error");
      return false;
    }
  }

  function clearLog(tabId: string): void {
    const session = sessionFor(tabId);
    session.log = [];
  }

  /** Aba fechada: derruba a conexão e descarta o histórico. */
  function dispose(tabId: string): void {
    if (!sessions[tabId]) return;
    void window.wttp.ws.close(tabId).catch(() => undefined);
    delete sessions[tabId];
  }

  return { sessions, sessionFor, connect, disconnect, toggle, send, clearLog, dispose };
});

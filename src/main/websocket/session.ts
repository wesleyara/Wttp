/**
 * Sessões WebSocket (ClickLocal #476): uma conexão persistente por `sessionId`, com o
 * ciclo de vida inteiro no main. Reconexão automática só para queda inesperada — fechar
 * pelo botão nunca reconecta (arch-docs/file-format.md §10). O módulo não conhece
 * Electron: quem registra o IPC (`ipc/websocket.ts`) liga `emit` ao `webContents` dono.
 *
 * Usa o `WebSocket` global do Node (undici), que aceita `headers` num segundo argumento
 * fora do padrão do browser — é o que deixa `Authorization`/headers customizados no
 * handshake. Não aplica `validateTls`: o cliente confia na cadeia do sistema.
 */

import type { WebSocketEvent } from "@shared";

import type { PreparedConnection } from "./prepare";

export class WebSocketSessionError extends Error {}

type Emit = (event: WebSocketEvent) => void;

/** O mínimo do `WebSocket` que o módulo usa — o tipo global muda entre versões do Node. */
interface Socket {
  readonly protocol: string;
  binaryType: string;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
}

type WebSocketCtor = new (
  url: string,
  options: { protocols: string[]; headers: Record<string, string> },
) => Socket;

const CONNECTING = 0;
const OPEN = 1;
/** Acima disso o texto vai truncado para o renderer — evita travar a UI com um frame gigante. */
const MAX_PAYLOAD_CHARS = 1_000_000;

interface Session {
  owner: unknown;
  spec: PreparedConnection;
  emit: Emit;
  socket: Socket | null;
  /** Tentativas seguidas sem sucesso; uma conexão estabelecida zera. */
  attempt: number;
  manualClose: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, Session>();

/** Duplicatas viram um header só (`a, b`), como o HTTP faz; desabilitados e sem nome saem. */
export function headersRecord(headers: PreparedConnection["headers"]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const header of headers) {
    const name = header.name.trim();
    if (!header.enabled || name === "") continue;
    // Quem escolhe o subprotocolo é `websocket.subprotocols`; undici monta o resto do handshake.
    if (/^(host|upgrade|connection|sec-websocket-.*)$/i.test(name)) continue;
    const existing = Object.keys(record).find(key => key.toLowerCase() === name.toLowerCase());
    if (existing) record[existing] = `${record[existing]}, ${header.value}`;
    else record[name] = header.value;
  }
  return record;
}

/** Texto como está; binário vira UTF-8 quando é texto válido, senão um dump hexadecimal. */
export function describePayload(data: unknown): { text: string; size: number } {
  let text: string;
  let size: number;
  if (typeof data === "string") {
    text = data;
    size = Buffer.byteLength(data);
  } else {
    const bytes =
      data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data as ArrayBufferLike);
    size = bytes.byteLength;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      const shown = Array.from(bytes.slice(0, 512), byte => byte.toString(16).padStart(2, "0"));
      text = `[binary ${size} bytes] ${shown.join(" ")}${size > 512 ? " …" : ""}`;
    }
  }
  if (text.length > MAX_PAYLOAD_CHARS) text = `${text.slice(0, MAX_PAYLOAD_CHARS)}…`;
  return { text, size };
}

function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WebSocketSessionError(`"${url}" is not a valid URL.`);
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new WebSocketSessionError(
      `A WebSocket URL must start with ws:// or wss:// (got "${url}").`,
    );
  }
}

function clearTimer(session: Session): void {
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
}

function open(id: string, session: Session): void {
  const { spec, emit } = session;
  let socket: Socket;
  try {
    socket = new (globalThis as unknown as { WebSocket: WebSocketCtor }).WebSocket(spec.url, {
      protocols: spec.subprotocols,
      headers: headersRecord(spec.headers),
    });
  } catch (error) {
    emit({
      sessionId: id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      at: Date.now(),
    });
    session.socket = null;
    finish(id, session);
    return;
  }
  socket.binaryType = "arraybuffer";
  session.socket = socket;

  socket.onopen = () => {
    if (session.socket !== socket) return;
    session.attempt = 0;
    emit({ sessionId: id, type: "open", protocol: socket.protocol });
    emit({ sessionId: id, type: "state", state: "open" });
  };
  socket.onmessage = event => {
    if (session.socket !== socket) return;
    const { text, size } = describePayload(event.data);
    emit({ sessionId: id, type: "message", data: text, size, at: Date.now() });
  };
  /** Encerra este socket uma vez só (idempotente): emite `close` e decide entre reconectar e fechar a sessão. */
  const settle = (code: number, reason: string, wasClean: boolean): void => {
    if (session.socket !== socket) return;
    session.socket = null;
    emit({ sessionId: id, type: "close", code, reason, wasClean, at: Date.now() });
    finish(id, session);
  };
  socket.onerror = event => {
    if (session.socket !== socket) return;
    emit({
      sessionId: id,
      type: "error",
      message: event.message || "Connection failed.",
      at: Date.now(),
    });
    // No Node 22 (o do Electron 39) um handshake recusado dispara só `error`: o socket fica
    // em CONNECTING e nunca emite `close`. Sem isto a sessão travaria em "connecting" e a
    // reconexão não rodaria. No Node 24 o `close` chega logo depois e `settle` ignora o segundo.
    setTimeout(() => {
      if (session.socket !== socket || socket.readyState !== CONNECTING) return;
      try {
        socket.close();
      } catch {
        // já encerrado
      }
      settle(1006, "", false);
    }, 0);
  };
  socket.onclose = event => settle(event.code, event.reason, event.wasClean);
}

/** Decide, depois de uma queda, entre reconectar e encerrar a sessão. */
function finish(id: string, session: Session): void {
  const { reconnect } = session.spec;
  const canRetry =
    !session.manualClose &&
    reconnect.enabled &&
    (reconnect.maxAttempts === 0 || session.attempt < reconnect.maxAttempts);

  if (!canRetry) {
    sessions.delete(id);
    session.emit({ sessionId: id, type: "state", state: "closed" });
    return;
  }

  session.attempt += 1;
  session.emit({ sessionId: id, type: "state", state: "reconnecting", attempt: session.attempt });
  session.timer = setTimeout(
    () => {
      session.timer = null;
      if (session.manualClose) return;
      session.emit({ sessionId: id, type: "state", state: "connecting", attempt: session.attempt });
      open(id, session);
    },
    Math.max(0, session.spec.reconnect.delayMs),
  );
}

/** Abre (ou reabre) a conexão da sessão; uma anterior com o mesmo id é fechada antes. */
export function connectSession(spec: PreparedConnection, owner: unknown, emit: Emit): void {
  validateUrl(spec.url);
  const previous = sessions.get(spec.sessionId);
  if (previous) {
    if (previous.owner !== owner) {
      throw new WebSocketSessionError(
        `WebSocket session ${spec.sessionId} belongs to another window.`,
      );
    }
    disposeSession(spec.sessionId, previous);
  }

  const session: Session = {
    owner,
    spec,
    emit,
    socket: null,
    attempt: 0,
    manualClose: false,
    timer: null,
  };
  sessions.set(spec.sessionId, session);
  emit({ sessionId: spec.sessionId, type: "state", state: "connecting" });
  open(spec.sessionId, session);
}

function entryFor(id: string, owner: unknown): Session {
  const session = sessions.get(id);
  // Uma janela nunca mexe na sessão de outra.
  if (!session || session.owner !== owner) {
    throw new WebSocketSessionError(`No WebSocket session "${id}".`);
  }
  return session;
}

export function sendMessage(id: string, owner: unknown, data: string): void {
  const session = entryFor(id, owner);
  if (!session.socket || session.socket.readyState !== OPEN) {
    throw new WebSocketSessionError("The WebSocket is not connected.");
  }
  session.socket.send(data);
  session.emit({
    sessionId: id,
    type: "sent",
    data: data.length > MAX_PAYLOAD_CHARS ? `${data.slice(0, MAX_PAYLOAD_CHARS)}…` : data,
    size: Buffer.byteLength(data),
    at: Date.now(),
  });
}

function disposeSession(id: string, session: Session): void {
  session.manualClose = true;
  clearTimer(session);
  const socket = session.socket;
  session.socket = null;
  sessions.delete(id);
  if (socket) {
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    try {
      socket.close(1000);
    } catch {
      // já fechado
    }
  }
}

/** Fecha pelo usuário: nunca reconecta. Sessão desconhecida é um no-op (já caiu sozinha). */
export function closeSession(id: string, owner: unknown): void {
  const session = sessions.get(id);
  if (!session || session.owner !== owner) return;
  const hadSocket = session.socket !== null;
  const { emit } = session;
  disposeSession(id, session);
  if (hadSocket) {
    emit({ sessionId: id, type: "close", code: 1000, reason: "", wasClean: true, at: Date.now() });
  }
  emit({ sessionId: id, type: "state", state: "closed" });
}

/** Janela fechada: derruba tudo que ela abriu, sem emitir para um `webContents` morto. */
export function closeAllSessionsFor(owner: unknown): void {
  for (const [id, session] of [...sessions]) {
    if (session.owner === owner) disposeSession(id, session);
  }
}

export function sessionCountForTests(): number {
  return sessions.size;
}

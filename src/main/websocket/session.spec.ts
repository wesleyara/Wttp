import type { WebSocketEvent } from "@shared";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PreparedConnection } from "./prepare";

import { TestWebSocketServer } from "../testing/webSocketServer";
import {
  closeAllSessionsFor,
  closeSession,
  connectSession,
  describePayload,
  headersRecord,
  sendMessage,
  sessionCountForTests,
} from "./session";

function specFor(url: string, patch: Partial<PreparedConnection> = {}): PreparedConnection {
  return {
    sessionId: "tab-1",
    url,
    headers: [],
    subprotocols: [],
    reconnect: { enabled: false, maxAttempts: 0, delayMs: 10 },
    ...patch,
  };
}

async function waitFor(check: () => boolean, label: string, timeout = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

const owner = {};
let server: TestWebSocketServer;
let events: WebSocketEvent[];
const emit = (event: WebSocketEvent): void => {
  events.push(event);
};
const states = (): string[] =>
  events.flatMap(event => (event.type === "state" ? [event.state] : []));

beforeEach(async () => {
  server = new TestWebSocketServer();
  await server.start();
  events = [];
});

afterEach(async () => {
  closeAllSessionsFor(owner);
  await server.stop();
});

describe("headersRecord", () => {
  it("drops disabled, unnamed and handshake-owned headers and joins duplicates", () => {
    expect(
      headersRecord([
        { name: "X-A", value: "1", enabled: true },
        { name: "x-a", value: "2", enabled: true },
        { name: "X-Off", value: "3", enabled: false },
        { name: "  ", value: "4", enabled: true },
        { name: "Sec-WebSocket-Protocol", value: "evil", enabled: true },
        { name: "Host", value: "evil", enabled: true },
      ]),
    ).toEqual({ "X-A": "1, 2" });
  });
});

describe("describePayload", () => {
  it("passes text through and decodes valid UTF-8 binary", () => {
    expect(describePayload("héllo")).toEqual({ text: "héllo", size: 6 });
    expect(describePayload(new TextEncoder().encode("ok").buffer)).toEqual({ text: "ok", size: 2 });
  });

  it("dumps invalid UTF-8 binary as hex", () => {
    const { text, size } = describePayload(new Uint8Array([0xff, 0x00, 0xfe]).buffer);
    expect(size).toBe(3);
    expect(text).toBe("[binary 3 bytes] ff 00 fe");
  });
});

describe("connectSession", () => {
  it("rejects URLs that are not ws:// or wss://", () => {
    expect(() => connectSession(specFor("https://example.com"), owner, emit)).toThrow(/ws:\/\//);
    expect(() => connectSession(specFor("nope"), owner, emit)).toThrow(/not a valid URL/);
  });

  it("connects, sends a message and receives the echo", async () => {
    connectSession(specFor(server.url), owner, emit);
    await waitFor(() => states().includes("open"), "open");

    sendMessage("tab-1", owner, "hello");
    await waitFor(() => events.some(e => e.type === "message"), "echo");

    expect(events).toContainEqual(
      expect.objectContaining({ type: "sent", data: "hello", size: 5 }),
    );
    expect(events).toContainEqual(expect.objectContaining({ type: "message", data: "echo:hello" }));
    expect(server.received).toEqual(["hello"]);
  });

  it("sends the custom headers and negotiates the subprotocol", async () => {
    connectSession(
      specFor(server.url, {
        headers: [{ name: "Authorization", value: "Bearer abc", enabled: true }],
        subprotocols: ["chat", "superchat"],
      }),
      owner,
      emit,
    );
    await waitFor(() => states().includes("open"), "open");

    expect(server.handshakes[0].authorization).toBe("Bearer abc");
    expect(server.handshakes[0]["sec-websocket-protocol"]).toBe("chat, superchat");
    expect(events).toContainEqual({ sessionId: "tab-1", type: "open", protocol: "chat" });
  });

  it("surfaces server-pushed messages", async () => {
    server.onConnect = socket => server.push(socket, "welcome");
    connectSession(specFor(server.url), owner, emit);
    await waitFor(() => events.some(e => e.type === "message"), "push");
    expect(events).toContainEqual(expect.objectContaining({ type: "message", data: "welcome" }));
  });

  it("refuses to send while not connected", () => {
    expect(() => sendMessage("nope", owner, "x")).toThrow(/No WebSocket session/);
  });
});

describe("closeSession", () => {
  it("closes by the user without reconnecting, even with reconnect enabled", async () => {
    connectSession(
      specFor(server.url, { reconnect: { enabled: true, maxAttempts: 5, delayMs: 10 } }),
      owner,
      emit,
    );
    await waitFor(() => states().includes("open"), "open");

    closeSession("tab-1", owner);
    await new Promise(resolve => setTimeout(resolve, 80));

    expect(states().at(-1)).toBe("closed");
    expect(states()).not.toContain("reconnecting");
    expect(server.handshakes).toHaveLength(1);
    expect(sessionCountForTests()).toBe(0);
  });

  it("is a no-op for an unknown or foreign session", () => {
    expect(() => closeSession("ghost", owner)).not.toThrow();
  });

  it("does not let another owner touch the session", async () => {
    connectSession(specFor(server.url), owner, emit);
    await waitFor(() => states().includes("open"), "open");
    expect(() => sendMessage("tab-1", {}, "x")).toThrow(/No WebSocket session/);
    closeSession("tab-1", {});
    expect(sessionCountForTests()).toBe(1);
  });
});

describe("reconnect", () => {
  it("reconnects after an unexpected drop and resets the attempt counter", async () => {
    connectSession(
      specFor(server.url, { reconnect: { enabled: true, maxAttempts: 3, delayMs: 10 } }),
      owner,
      emit,
    );
    await waitFor(() => states().includes("open"), "first open");

    server.dropAll();
    await waitFor(() => states().filter(s => s === "open").length === 2, "second open");

    expect(states()).toContain("reconnecting");
    expect(server.handshakes).toHaveLength(2);
    // Voltou a conectar: a próxima queda de novo tem `maxAttempts` tentativas.
    server.dropAll();
    await waitFor(() => states().filter(s => s === "open").length === 3, "third open");
  });

  it("gives up after maxAttempts failed attempts", async () => {
    server.rejectUpgrades = 99;
    connectSession(
      specFor(server.url, { reconnect: { enabled: true, maxAttempts: 2, delayMs: 5 } }),
      owner,
      emit,
    );
    await waitFor(() => states().at(-1) === "closed", "given up");

    // 1 tentativa inicial + 2 reconexões (o undici bate no servidor mais de uma vez por tentativa recusada).
    expect(events.filter(e => e.type === "state" && e.state === "connecting")).toHaveLength(3);
    expect(events.filter(e => e.type === "state" && e.state === "reconnecting")).toHaveLength(2);
    expect(sessionCountForTests()).toBe(0);
  });

  it("does not reconnect when disabled", async () => {
    connectSession(specFor(server.url), owner, emit);
    await waitFor(() => states().includes("open"), "open");
    server.dropAll();
    await waitFor(() => states().at(-1) === "closed", "closed");
    expect(states()).not.toContain("reconnecting");
    expect(server.handshakes).toHaveLength(1);
  });

  it("maxAttempts 0 keeps retrying until it succeeds", async () => {
    server.rejectUpgrades = 4;
    connectSession(
      specFor(server.url, { reconnect: { enabled: true, maxAttempts: 0, delayMs: 5 } }),
      owner,
      emit,
    );
    await waitFor(() => states().includes("open"), "eventual open");
    expect(events.some(e => e.type === "state" && e.state === "reconnecting")).toBe(true);
  });
});

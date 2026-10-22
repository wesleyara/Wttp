import type { WebSocketEvent, WebSocketLogEntry } from "@shared";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { filterLog, MAX_LOG_ENTRIES, reconnectSettings, useWebSocketStore } from "./websocket";

function entry(
  id: number,
  direction: WebSocketLogEntry["direction"],
  data: string,
): WebSocketLogEntry {
  return { id, at: 0, direction, data, size: data.length };
}

describe("reconnectSettings", () => {
  it("defaults: off, 5 attempts, 1s", () => {
    expect(reconnectSettings({})).toEqual({ enabled: false, maxAttempts: 5, delayMs: 1000 });
  });

  it("keeps configured values and clamps negatives to 0", () => {
    expect(
      reconnectSettings({ reconnect: { enabled: true, maxAttempts: 0, delayMs: -5 } }),
    ).toEqual({ enabled: true, maxAttempts: 0, delayMs: 0 });
  });
});

describe("filterLog", () => {
  const log = [
    entry(1, "system", "Connected"),
    entry(2, "out", '{"type":"PING"}'),
    entry(3, "in", '{"type":"pong"}'),
    entry(4, "in", "hello"),
  ];

  it("returns everything with no filter", () => {
    expect(filterLog(log, "", "all")).toHaveLength(4);
  });

  it("filters by direction but always keeps system lines", () => {
    expect(filterLog(log, "", "in").map(e => e.id)).toEqual([1, 3, 4]);
    expect(filterLog(log, "", "out").map(e => e.id)).toEqual([1, 2]);
  });

  it("filters by text, ignoring case", () => {
    expect(filterLog(log, "ping", "all").map(e => e.id)).toEqual([2]);
    expect(filterLog(log, "  TYPE ", "in").map(e => e.id)).toEqual([3]);
  });
});

describe("useWebSocketStore events", () => {
  let emit: (event: WebSocketEvent) => void;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("window", {
      wttp: {
        ws: {
          onEvent: (callback: (event: WebSocketEvent) => void) => {
            emit = callback;
            return () => undefined;
          },
        },
      },
    });
  });

  it("tracks state, the negotiated subprotocol and the message history", () => {
    const store = useWebSocketStore();
    emit({ sessionId: "a", type: "state", state: "connecting" });
    expect(store.sessionFor("a").state).toBe("connecting");

    emit({ sessionId: "a", type: "open", protocol: "chat" });
    emit({ sessionId: "a", type: "state", state: "open" });
    emit({ sessionId: "a", type: "sent", data: "hi", size: 2, at: 1 });
    emit({ sessionId: "a", type: "message", data: "echo:hi", size: 7, at: 2 });

    const session = store.sessionFor("a");
    expect(session.state).toBe("open");
    expect(session.protocol).toBe("chat");
    expect(session.log.map(e => e.direction)).toEqual(["system", "out", "in"]);
    expect(session.log.map(e => e.id)).toEqual([1, 2, 3]);
  });

  it("keeps sessions of different tabs apart", () => {
    const store = useWebSocketStore();
    emit({ sessionId: "a", type: "message", data: "x", size: 1, at: 1 });
    expect(store.sessionFor("b").log).toHaveLength(0);
  });

  it("records reconnect attempts and the close reason", () => {
    const store = useWebSocketStore();
    emit({ sessionId: "a", type: "close", code: 1006, reason: "", wasClean: false, at: 1 });
    emit({ sessionId: "a", type: "state", state: "reconnecting", attempt: 2 });

    const session = store.sessionFor("a");
    expect(session.state).toBe("reconnecting");
    expect(session.attempt).toBe(2);
    expect(session.log.every(e => e.direction === "system")).toBe(true);
    expect(session.log[0].data).toContain("1006");
  });

  it("drops the oldest lines past the cap", () => {
    const store = useWebSocketStore();
    for (let i = 0; i < MAX_LOG_ENTRIES + 10; i++) {
      emit({ sessionId: "a", type: "message", data: String(i), size: 1, at: i });
    }
    const { log } = store.sessionFor("a");
    expect(log).toHaveLength(MAX_LOG_ENTRIES);
    expect(log[0].data).toBe("10");
  });

  it("clearLog empties the history", () => {
    const store = useWebSocketStore();
    emit({ sessionId: "a", type: "message", data: "x", size: 1, at: 1 });
    store.clearLog("a");
    expect(store.sessionFor("a").log).toEqual([]);
  });
});

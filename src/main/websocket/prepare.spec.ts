import type { WebSocketConnectSpec } from "@shared";

import { describe, expect, it } from "vitest";

import { prepareConnection } from "./prepare";

function spec(patch: Partial<WebSocketConnectSpec> = {}): WebSocketConnectSpec {
  return {
    sessionId: "s",
    url: "wss://example.com/chat?stale=1",
    query: [],
    headers: [],
    auth: { type: "none" },
    subprotocols: [],
    reconnect: { enabled: false, maxAttempts: 0, delayMs: 1000 },
    ...patch,
  };
}

describe("prepareConnection", () => {
  it("replaces the URL query string with the enabled query rows", () => {
    const prepared = prepareConnection(
      spec({
        query: [
          { name: "room", value: "a b", enabled: true },
          { name: "off", value: "x", enabled: false },
        ],
      }),
    );
    expect(prepared.url).toBe("wss://example.com/chat?room=a+b");
  });

  it("applies bearer auth as an Authorization header", () => {
    const prepared = prepareConnection(
      spec({ auth: { type: "bearer", bearer: { token: "t0k" } } }),
    );
    expect(prepared.headers).toContainEqual({
      name: "Authorization",
      value: "Bearer t0k",
      enabled: true,
    });
  });

  it("lets a manual Authorization header win over bearer", () => {
    const prepared = prepareConnection(
      spec({
        auth: { type: "bearer", bearer: { token: "t0k" } },
        headers: [{ name: "authorization", value: "Custom", enabled: true }],
      }),
    );
    expect(prepared.headers).toHaveLength(1);
    expect(prepared.headers[0].value).toBe("Custom");
  });

  it("puts an API key with in:query on the URL", () => {
    const prepared = prepareConnection(
      spec({ auth: { type: "apikey", apikey: { key: "k", value: "v", in: "query" } } }),
    );
    expect(prepared.url).toBe("wss://example.com/chat?k=v");
  });

  it("drops blank subprotocols", () => {
    expect(prepareConnection(spec({ subprotocols: [" chat ", "", "  "] })).subprotocols).toEqual([
      "chat",
    ]);
  });

  it("returns an unparseable URL untouched", () => {
    expect(prepareConnection(spec({ url: "nope" })).url).toBe("nope");
  });
});

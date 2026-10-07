import type { HistoryEntry } from "@shared";

import { queryJsonPath } from "@shared/jsonpath";
import { describe, expect, it } from "vitest";

import { childPath, compileIgnores, diffHeaders, diffJson, diffResponses } from "./responseDiff";

describe("diffJson (ClickLocal #49)", () => {
  it("ignores key order and reports changes by path", () => {
    const before = {
      data: {
        items: [
          { id: 1, price: 10 },
          { id: 2, price: 11 },
        ],
      },
      ok: true,
    };
    const after = {
      ok: true,
      data: {
        items: [
          { price: 10, id: 1 },
          { id: 2, price: 12 },
        ],
      },
    };
    expect(diffJson(before, after)).toEqual([
      { path: "$.data.items[1].price", kind: "changed", before: "11", after: "12" },
    ]);
  });

  it("compares arrays by position, reporting added and removed items", () => {
    expect(diffJson([1, 2, 3], [1, 5])).toEqual([
      { path: "$[1]", kind: "changed", before: "2", after: "5" },
      { path: "$[2]", kind: "removed", before: "3" },
    ]);
    expect(diffJson({ tags: [] }, { tags: ["a"] })).toEqual([
      { path: "$.tags[0]", kind: "added", after: '"a"' },
    ]);
  });

  it("reports a changed type as typeChanged, not as a plain value change", () => {
    expect(diffJson({ id: 10 }, { id: "10" })).toEqual([
      { path: "$.id", kind: "typeChanged", before: "10", after: '"10"' },
    ]);
    expect(diffJson({ a: [1] }, { a: { 0: 1 } })).toEqual([
      { path: "$.a", kind: "typeChanged", before: "[1]", after: '{"0":1}' },
    ]);
  });

  it("tells null apart from an absent key", () => {
    expect(diffJson({ a: null }, {})).toEqual([{ path: "$.a", kind: "removed", before: "null" }]);
    expect(diffJson({}, { a: null })).toEqual([{ path: "$.a", kind: "added", after: "null" }]);
    expect(diffJson({ a: null }, { a: 0 })).toEqual([
      { path: "$.a", kind: "typeChanged", before: "null", after: "0" },
    ]);
  });

  it("writes paths the JSONPath filter can read back", () => {
    const doc = { "x-request-id": { list: [{ "a b": 1 }] } };
    const path = childPath(childPath(childPath(childPath("$", "x-request-id"), "list"), 0), "a b");
    expect(path).toBe("$['x-request-id'].list[0]['a b']");
    expect(queryJsonPath(doc, path)).toEqual([1]);
  });

  it("drops ignored paths and everything below them, with [*] matching any index", () => {
    const before = {
      meta: { timestamp: 1, requestId: "a" },
      items: [
        { updatedAt: 1, v: 1 },
        { updatedAt: 2, v: 2 },
      ],
    };
    const after = {
      meta: { timestamp: 2, requestId: "b" },
      items: [
        { updatedAt: 3, v: 1 },
        { updatedAt: 4, v: 9 },
      ],
    };
    const ignored = compileIgnores(["$.meta", "$.items[*].updatedAt"]);
    expect(diffJson(before, after, ignored)).toEqual([
      { path: "$.items[1].v", kind: "changed", before: "2", after: "9" },
    ]);
    // Prefixo de nome não é descendente: ignorar `$.meta` não esconde `$.metadata`.
    expect(compileIgnores(["$.meta"])("$.metadata")).toBe(false);
  });
});

describe("diffHeaders", () => {
  it("compares names case-insensitively and honors ignored headers", () => {
    const before = [
      { name: "Content-Type", value: "application/json", enabled: true },
      { name: "Date", value: "Mon", enabled: true },
      { name: "X-Old", value: "1", enabled: true },
    ];
    const after = [
      { name: "content-type", value: "application/json; charset=utf-8", enabled: true },
      { name: "Date", value: "Tue", enabled: true },
      { name: "X-New", value: "2", enabled: true },
    ];
    expect(diffHeaders(before, after, new Set(["date"]))).toEqual([
      {
        name: "Content-Type",
        kind: "changed",
        before: "application/json",
        after: "application/json; charset=utf-8",
      },
      { name: "X-Old", kind: "removed", before: "1" },
      { name: "X-New", kind: "added", after: "2" },
    ]);
  });
});

function entry(
  status: number,
  body: string,
  headers: [string, string][] = [],
  truncated = false,
): HistoryEntry {
  return {
    id: String(Math.random()),
    at: new Date().toISOString(),
    request: { method: "GET", url: "http://x", query: [], headers: [], body: { type: "none" } },
    response: {
      ok: true,
      status,
      statusText: status === 200 ? "OK" : "Created",
      headers: headers.map(([name, value]) => ({ name, value, enabled: true })),
      charset: "utf-8",
      size: { headersSent: 0, bodySent: 0, headersReceived: 0, bodyReceived: body.length },
      timing: { dns: 0, connect: 0, tls: 0, ttfb: 0, download: 0, total: 1 },
      body,
      bodyTruncated: truncated,
    },
  };
}

describe("diffResponses", () => {
  it("combines status, headers and a semantic JSON body diff", () => {
    const diff = diffResponses(
      entry(200, '{"a":1,"b":2}', [
        ["Date", "Mon"],
        ["ETag", "1"],
      ]),
      entry(201, '{"b":2,"a":3}', [
        ["Date", "Tue"],
        ["ETag", "2"],
      ]),
      { ignored: ["header:Date"] },
    );
    expect(diff.status).toEqual({ before: "200 OK", after: "201 Created" });
    expect(diff.headers).toEqual([{ name: "ETag", kind: "changed", before: "1", after: "2" }]);
    expect(diff.body).toEqual({
      mode: "json",
      changes: [{ path: "$.a", kind: "changed", before: "1", after: "3" }],
    });
  });

  it("hides headers with ignoreHeaders, falls back to a text diff and flags truncation", () => {
    const diff = diffResponses(
      entry(200, "line 1\nline 2", [["X", "1"]]),
      entry(200, "line 1\nline 3", [["X", "2"]], true),
      { ignoreHeaders: true },
    );
    expect(diff.headers).toEqual([]);
    expect(diff.body).toMatchObject({ mode: "text", changed: true });
    expect(diff.truncated).toBe(true);
  });

  it("compares a failed run by its error code", () => {
    const failed: HistoryEntry = {
      ...entry(200, ""),
      response: { ok: false, error: { code: "TIMEOUT", message: "timed out" } },
    };
    expect(diffResponses(entry(200, "{}"), failed).status).toEqual({
      before: "200 OK",
      after: "TIMEOUT",
    });
  });
});

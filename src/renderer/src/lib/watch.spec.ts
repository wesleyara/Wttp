import type { HttpResponseResult } from "@shared";

import { describe, expect, it } from "vitest";

import { defaultWatchConfig, resultToEntry, untilMatches, validateWatchConfig } from "./watch";

function ok(status: number, body: string): HttpResponseResult {
  return {
    ok: true,
    requestId: "r",
    status,
    statusText: "",
    headers: [],
    body: new TextEncoder().encode(body),
    charset: "utf-8",
    size: { headersSent: 0, bodySent: 0, headersReceived: 0, bodyReceived: body.length },
    timing: { dns: 0, connect: 0, tls: 0, ttfb: 0, download: 0, total: 0 },
  } as HttpResponseResult;
}

describe("validateWatchConfig", () => {
  it("enforces the 1s minimum interval", () => {
    expect(validateWatchConfig({ ...defaultWatchConfig(), intervalSeconds: 0.5 })).toBe("interval");
    expect(validateWatchConfig({ ...defaultWatchConfig(), intervalSeconds: 1 })).toBeNull();
  });

  it("requires a positive attempt limit whenever there is a stop condition", () => {
    const config = { ...defaultWatchConfig(), until: "tests" as const };
    expect(validateWatchConfig({ ...config, maxAttempts: 0 })).toBe("maxAttempts");
    expect(validateWatchConfig({ ...config, maxAttempts: 5 })).toBeNull();
  });

  it("validates status and JSONPath conditions", () => {
    const base = { ...defaultWatchConfig(), until: "status" as const };
    expect(validateWatchConfig({ ...base, status: "20" })).toBe("status");
    const json = { ...defaultWatchConfig(), until: "json" as const };
    expect(validateWatchConfig({ ...json, jsonPath: "" })).toBe("jsonPath");
    expect(validateWatchConfig({ ...json, jsonPath: "$.a[" })).toBe("jsonPathSyntax");
    expect(validateWatchConfig({ ...json, jsonPath: "$.status" })).toBeNull();
  });
});

describe("untilMatches", () => {
  const config = defaultWatchConfig();

  it("never matches without a condition", () => {
    expect(untilMatches(config, { result: ok(200, "{}"), assertions: [] })).toBe(false);
  });

  it("matches a status", () => {
    const c = { ...config, until: "status" as const, status: "201" };
    expect(untilMatches(c, { result: ok(201, ""), assertions: [] })).toBe(true);
    expect(untilMatches(c, { result: ok(200, ""), assertions: [] })).toBe(false);
  });

  it("matches a JSON field as text", () => {
    const c = { ...config, until: "json" as const, jsonPath: "$.job.status", jsonValue: "done" };
    const at = (s: string): { result: HttpResponseResult; assertions: [] } => ({
      result: ok(200, `{"job":{"status":"${s}"}}`),
      assertions: [],
    });
    expect(untilMatches(c, at("processing"))).toBe(false);
    expect(untilMatches(c, at("done"))).toBe(true);
    expect(
      untilMatches(
        { ...c, jsonValue: "3", jsonPath: "$.n" },
        { result: ok(200, '{"n":3}'), assertions: [] },
      ),
    ).toBe(true);
    expect(untilMatches(c, { result: ok(200, "not json"), assertions: [] })).toBe(false);
  });

  it("matches only when there are assertions and all passed", () => {
    const c = { ...config, until: "tests" as const };
    const result = ok(200, "");
    expect(untilMatches(c, { result, assertions: [] })).toBe(false);
    expect(untilMatches(c, { result, assertions: [{ passed: true }, { passed: false }] })).toBe(
      false,
    );
    expect(untilMatches(c, { result, assertions: [{ passed: true }] })).toBe(true);
  });
});

describe("resultToEntry", () => {
  it("decodes the body for the semantic diff", () => {
    const entry = resultToEntry(ok(200, '{"a":1}'));
    expect(entry.response.ok && entry.response.body).toBe('{"a":1}');
  });
});

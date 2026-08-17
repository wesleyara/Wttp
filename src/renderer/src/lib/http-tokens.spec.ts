import { describe, expect, it } from "vitest";

import { methodToken, statusToken } from "./http-tokens";

describe("methodToken", () => {
  it("maps known methods case-insensitively", () => {
    expect(methodToken("get")).toBe("text-method-get");
    expect(methodToken("POST")).toBe("text-method-post");
  });

  it("falls back to neutral for an unknown method", () => {
    expect(methodToken("TRACE")).toBe("text-method-neutral");
  });
});

describe("statusToken", () => {
  it("buckets status codes by range", () => {
    expect(statusToken(204)).toBe("text-status-2xx");
    expect(statusToken(301)).toBe("text-status-3xx");
    expect(statusToken(404)).toBe("text-status-4xx");
    expect(statusToken(503)).toBe("text-status-5xx");
  });

  it("maps a null code to a network error", () => {
    expect(statusToken(null)).toBe("text-status-error");
  });
});

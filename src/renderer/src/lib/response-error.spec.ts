import { describe, expect, it } from "vitest";

import { describeRequestError } from "./response-error";

describe("describeRequestError", () => {
  it("gives a specific, actionable message for known codes", () => {
    expect(describeRequestError("DNS_ERROR")).toMatch(/resolve the host/);
    expect(describeRequestError("TIMEOUT")).toMatch(/timed out/);
    expect(describeRequestError("CONNECTION_REFUSED")).toMatch(/connection was refused/);
  });

  it("never returns a bare 'unknown error' for an unmapped code", () => {
    const message = describeRequestError("UNKNOWN");
    expect(message.length).toBeGreaterThan(10);
  });
});

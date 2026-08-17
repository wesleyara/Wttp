import { describe, expect, it } from "vitest";

import { detectCharset } from "./charset";

describe("detectCharset", () => {
  it("defaults to utf-8 when there is no content-type", () => {
    expect(detectCharset(undefined)).toBe("utf-8");
  });

  it("defaults to utf-8 when the content-type has no charset", () => {
    expect(detectCharset("application/json")).toBe("utf-8");
  });

  it("extracts the charset parameter, case-insensitively", () => {
    expect(detectCharset("text/html; charset=ISO-8859-1")).toBe("iso-8859-1");
  });

  it("strips quotes around the charset value", () => {
    expect(detectCharset('text/plain; charset="utf-16"')).toBe("utf-16");
  });
});

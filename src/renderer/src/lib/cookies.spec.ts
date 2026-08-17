import { describe, expect, it } from "vitest";

import { parseSetCookieHeader } from "./cookies";

describe("parseSetCookieHeader", () => {
  it("parses name, value and attributes", () => {
    expect(parseSetCookieHeader("session=abc123; Path=/; HttpOnly; Secure")).toEqual({
      name: "session",
      value: "abc123",
      attributes: { Path: "/", HttpOnly: true, Secure: true },
    });
  });

  it("handles a cookie with no attributes", () => {
    expect(parseSetCookieHeader("theme=dark")).toEqual({
      name: "theme",
      value: "dark",
      attributes: {},
    });
  });

  it("handles a value containing an equals sign", () => {
    expect(parseSetCookieHeader("token=a=b=c; Max-Age=3600")).toEqual({
      name: "token",
      value: "a=b=c",
      attributes: { "Max-Age": "3600" },
    });
  });
});

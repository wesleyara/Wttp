import { describe, expect, it } from "vitest";

import { parseQueryFromUrl, rewriteUrlQuery, urlBase } from "./url-query-sync";

describe("urlBase", () => {
  it("strips the query string", () => {
    expect(urlBase("https://api.dev/users?a=1")).toBe("https://api.dev/users");
  });

  it("returns the url unchanged when there is no query string", () => {
    expect(urlBase("{{base_url}}/users")).toBe("{{base_url}}/users");
  });
});

describe("parseQueryFromUrl", () => {
  it("returns an empty array when there is no query string", () => {
    expect(parseQueryFromUrl("https://api.dev/users")).toEqual([]);
  });

  it("parses params as enabled rows", () => {
    expect(parseQueryFromUrl("https://api.dev/users?a=1&b=2")).toEqual([
      { name: "a", value: "1", enabled: true, description: "" },
      { name: "b", value: "2", enabled: true, description: "" },
    ]);
  });

  it("decodes percent-encoded and special characters", () => {
    expect(parseQueryFromUrl("https://api.dev?q=a%20b%26c")).toEqual([
      { name: "q", value: "a b&c", enabled: true, description: "" },
    ]);
  });

  it("works against a templated base url", () => {
    expect(parseQueryFromUrl("{{base_url}}/users?verbose=true")).toEqual([
      { name: "verbose", value: "true", enabled: true, description: "" },
    ]);
  });
});

describe("rewriteUrlQuery", () => {
  it("appends only enabled rows, url-encoded", () => {
    const rows = [
      { name: "q", value: "a b&c", enabled: true },
      { name: "off", value: "x", enabled: false },
    ];
    expect(rewriteUrlQuery("https://api.dev/users", rows)).toBe("https://api.dev/users?q=a+b%26c");
  });

  it("drops the query string entirely when no row is enabled", () => {
    const rows = [{ name: "a", value: "1", enabled: false }];
    expect(rewriteUrlQuery("https://api.dev/users?a=1", rows)).toBe("https://api.dev/users");
  });

  it("ignores rows with an empty name", () => {
    const rows = [{ name: "", value: "x", enabled: true }];
    expect(rewriteUrlQuery("https://api.dev/users", rows)).toBe("https://api.dev/users");
  });

  it("replaces an existing query string rather than appending to it", () => {
    const rows = [{ name: "b", value: "2", enabled: true }];
    expect(rewriteUrlQuery("https://api.dev/users?a=1", rows)).toBe("https://api.dev/users?b=2");
  });
});

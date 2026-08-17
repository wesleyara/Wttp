import { describe, expect, it } from "vitest";

import type { SearchableText } from "./fuzzyMatch";

import { fuzzySearch, scoreMatch } from "./fuzzyMatch";

const text = (name: string, path = "", url = ""): SearchableText => ({ name, path, url });

describe("scoreMatch", () => {
  it("ranks a prefix match above a substring match above a subsequence match", () => {
    const prefix = scoreMatch("log", text("Login"))!;
    const substring = scoreMatch("log", text("User login"))!;
    const subsequence = scoreMatch("log", text("Ledger log output"))!;

    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(subsequence);
  });

  it("falls back to path/url when the name doesn't match", () => {
    expect(scoreMatch("users", text("Login", "auth/users", ""))).not.toBeNull();
    expect(scoreMatch("users", text("Login", "", "https://api.example.com/users"))).not.toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(scoreMatch("zzz", text("Login", "auth", "https://example.com"))).toBeNull();
  });

  it("returns null for an empty query", () => {
    expect(scoreMatch("", text("Login"))).toBeNull();
    expect(scoreMatch("   ", text("Login"))).toBeNull();
  });
});

describe("fuzzySearch", () => {
  it("filters and sorts by score, best match first", () => {
    const items = [text("User login"), text("Login"), text("Ledger log output")];
    const results = fuzzySearch("log", items, item => item);
    expect(results.map(r => r.name)).toEqual(["Login", "User login", "Ledger log output"]);
  });

  it("caps results at the given limit", () => {
    const items = Array.from({ length: 200 }, (_, i) => text(`Request ${i}`));
    const results = fuzzySearch("request", items, item => item, 50);
    expect(results).toHaveLength(50);
  });

  it("returns nothing for an empty query", () => {
    expect(fuzzySearch("", [text("Login")], item => item)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { JsonPathError, queryJsonPath } from "./jsonpath";

const doc = {
  store: {
    book: [
      { category: "reference", author: "Nigel Rees", title: "Sayings", price: 8.95 },
      { category: "fiction", author: "Evelyn Waugh", title: "Sword", price: 12.99 },
      {
        category: "fiction",
        author: "Herman Melville",
        title: "Moby Dick",
        isbn: "0-553",
        price: 8.99,
      },
      {
        category: "fiction",
        author: "J. R. R. Tolkien",
        title: "LOTR",
        isbn: "0-395",
        price: 22.99,
      },
    ],
    bicycle: { color: "red", price: 19.95 },
    "x-trace": "abc",
  },
  data: {
    items: [
      { id: 1, tags: [] },
      { id: 2, tags: ["a"] },
      { id: 3, tags: ["a", "b"] },
    ],
  },
  flags: { active: false, count: 0, none: null },
};

describe("queryJsonPath", () => {
  it("returns the root for $", () => {
    expect(queryJsonPath(doc, "$")).toEqual([doc]);
  });

  it("follows dot and bracket member access", () => {
    expect(queryJsonPath(doc, "$.store.bicycle.color")).toEqual(["red"]);
    expect(queryJsonPath(doc, "$['store']['bicycle'][\"price\"]")).toEqual([19.95]);
    expect(queryJsonPath(doc, "$.store['x-trace']")).toEqual(["abc"]);
    expect(queryJsonPath(doc, "$.store.x-trace")).toEqual(["abc"]);
  });

  it("returns nothing for a missing member, never throws", () => {
    expect(queryJsonPath(doc, "$.store.nope.deeper")).toEqual([]);
  });

  it("indexes arrays, including negative indexes", () => {
    expect(queryJsonPath(doc, "$.store.book[0].title")).toEqual(["Sayings"]);
    expect(queryJsonPath(doc, "$.store.book[-1].title")).toEqual(["LOTR"]);
    expect(queryJsonPath(doc, "$.store.book[9]")).toEqual([]);
  });

  it("supports wildcards, [*] and .*", () => {
    expect(queryJsonPath(doc, "$.data.items[*].id")).toEqual([1, 2, 3]);
    expect(queryJsonPath(doc, "$.store.bicycle.*")).toEqual(["red", 19.95]);
  });

  it("supports slices and unions", () => {
    expect(queryJsonPath(doc, "$.data.items[0:2].id")).toEqual([1, 2]);
    expect(queryJsonPath(doc, "$.data.items[-2:].id")).toEqual([2, 3]);
    expect(queryJsonPath(doc, "$.data.items[::2].id")).toEqual([1, 3]);
    expect(queryJsonPath(doc, "$.data.items[::-1].id")).toEqual([3, 2, 1]);
    expect(queryJsonPath(doc, "$.data.items[0,2].id")).toEqual([1, 3]);
    expect(queryJsonPath(doc, "$.store.bicycle['color','price']")).toEqual(["red", 19.95]);
  });

  it("supports recursive descent (..key, ..*)", () => {
    expect(queryJsonPath(doc, "$..author")).toEqual([
      "Nigel Rees",
      "Evelyn Waugh",
      "Herman Melville",
      "J. R. R. Tolkien",
    ]);
    expect(queryJsonPath(doc, "$..price")).toHaveLength(5);
    expect(queryJsonPath(doc, "$..book[0].title")).toEqual(["Sayings"]);
  });

  describe("filters", () => {
    it("compares numbers ([?(@.x > 1)])", () => {
      expect(queryJsonPath(doc, "$.data.items[?(@.id > 1)].id")).toEqual([2, 3]);
      expect(queryJsonPath(doc, "$.store.book[?(@.price <= 8.99)].title")).toEqual([
        "Sayings",
        "Moby Dick",
      ]);
    });

    it("compares strings and supports the parenthesis-free form", () => {
      expect(queryJsonPath(doc, "$.store.book[?@.category == 'reference'].title")).toEqual([
        "Sayings",
      ]);
      expect(queryJsonPath(doc, '$.store.book[?(@.author != "Nigel Rees")]')).toHaveLength(3);
    });

    it("tests existence and negation", () => {
      expect(queryJsonPath(doc, "$.store.book[?(@.isbn)].title")).toEqual(["Moby Dick", "LOTR"]);
      expect(queryJsonPath(doc, "$.store.book[?(!@.isbn)].title")).toEqual(["Sayings", "Sword"]);
    });

    it("combines with && and || and parentheses", () => {
      expect(
        queryJsonPath(doc, "$.store.book[?(@.category == 'fiction' && @.price < 10)].title"),
      ).toEqual(["Moby Dick"]);
      expect(
        queryJsonPath(doc, "$.store.book[?(@.price < 9 || (@.isbn && @.price > 20))].title"),
      ).toEqual(["Sayings", "Moby Dick", "LOTR"]);
    });

    it("compares false/0/null literally, not by truthiness", () => {
      expect(queryJsonPath(doc, "$.flags[?(@ == false)]")).toEqual([false]);
      expect(queryJsonPath(doc, "$.flags[?(@ == 0)]")).toEqual([0]);
      expect(queryJsonPath(doc, "$.flags[?(@ == null)]")).toEqual([null]);
    });

    it("gives arrays and strings a length", () => {
      expect(queryJsonPath(doc, "$.data.items[?(@.tags.length > 1)].id")).toEqual([3]);
    });

    it("can compare against the root with $", () => {
      expect(queryJsonPath(doc, "$.store.book[?(@.price > $.store.bicycle.price)].title")).toEqual([
        "LOTR",
      ]);
    });

    it("never mixes types in ordering comparisons", () => {
      expect(queryJsonPath(doc, "$.store.book[?(@.price > '1')]")).toEqual([]);
    });
  });

  describe("errors", () => {
    it.each([
      ["", 0],
      ["store.book", 0],
      ["$.store[", 8],
      ["$.store['book", 8],
      ["$.store.book[?(@.price >)]", 24],
      ["$.store.book[0:2:0]", 18],
      ["$ foo", 2],
    ])("rejects %j with a position", (expression, position) => {
      let error: unknown;
      try {
        queryJsonPath(doc, expression);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(JsonPathError);
      expect((error as JsonPathError).position).toBe(position);
    });
  });

  describe("no arbitrary code evaluation", () => {
    it.each([
      "$[?(@.constructor.constructor('globalThis.pwned = 1')())]",
      "$..[?(process.exit())]",
      "$[?(this.x = 1)]",
      "$[?(@.a; globalThis.pwned = 1)]",
      "$[?(`${globalThis.pwned = 1}`)]",
      "$[?(@.a = 1)]",
    ])("rejects %s without running it", expression => {
      expect(() => queryJsonPath(doc, expression)).toThrow(JsonPathError);
      expect((globalThis as { pwned?: unknown }).pwned).toBeUndefined();
    });

    it("never resolves prototype members", () => {
      expect(queryJsonPath(doc, "$.constructor")).toEqual([]);
      expect(queryJsonPath(doc, "$.__proto__")).toEqual([]);
      expect(queryJsonPath(doc, "$.store.book[?(@.constructor)]")).toEqual([]);
      expect(queryJsonPath(doc, "$['__proto__']['toString']")).toEqual([]);
    });
  });
});

import type { EnvironmentFile, FolderFile, RequestFile } from "@shared";

import { describe, expect, it } from "vitest";

import { diffEntries, diffEnvironment, diffFolder, diffRequest, lineDiff } from "./structuralDiff";

function request(overrides: Partial<RequestFile> = {}): RequestFile {
  return {
    wttp: 1,
    name: "List users",
    seq: 1,
    method: "GET",
    url: "{{base}}/users",
    headers: [
      { name: "Accept", value: "application/json", enabled: true },
      { name: "X-Api-Version", value: "1", enabled: true },
    ],
    ...overrides,
  };
}

describe("lineDiff", () => {
  it("keeps common lines and marks added/removed ones", () => {
    expect(lineDiff("a\nb\nc\n", "a\nx\nc\n")).toEqual([
      { type: "same", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "x" },
      { type: "same", text: "c" },
    ]);
    expect(lineDiff("", "new")).toEqual([{ type: "added", text: "new" }]);
  });
});

describe("diffEntries", () => {
  it("ignores reordering and reports a changed value as changed, not removed + added", () => {
    const before = request().headers!;
    const after = [
      { name: "x-api-version", value: "2", enabled: true },
      { name: "Accept", value: "application/json", enabled: true },
    ];
    expect(diffEntries(before, after, true)).toEqual([
      { kind: "changed", label: "X-Api-Version → x-api-version", before: "1", after: "2" },
    ]);
    expect(diffEntries(before, [...before].reverse(), true)).toEqual([]);
  });

  it("reports added and removed entries, disabled ones marked, and duplicates by occurrence", () => {
    const before = [
      { name: "tag", value: "a", enabled: true },
      { name: "tag", value: "b", enabled: true },
      { name: "gone", value: "x", enabled: true },
    ];
    const after = [
      { name: "tag", value: "a", enabled: true },
      { name: "tag", value: "b", enabled: false },
      { name: "new", value: "y", enabled: true },
    ];
    expect(diffEntries(before, after)).toEqual([
      { kind: "changed", label: "tag", before: "b", after: "b (disabled)" },
      { kind: "removed", label: "gone", before: "x" },
      { kind: "added", label: "new", after: "y" },
    ]);
  });

  it("never shows a secret variable's value", () => {
    const items = diffEntries(
      [{ name: "token", value: "", enabled: true }],
      [{ name: "token", value: "", enabled: true, secret: true }],
    );
    expect(items).toEqual([
      { kind: "changed", label: "token", before: "", after: "•••• (secret)" },
    ]);
  });
});

describe("diffRequest (ClickLocal #52)", () => {
  it("describes the changes field by field", () => {
    const before = request({
      query: [{ name: "limit", value: "10", enabled: true }],
      body: { type: "json", json: '{\n  "a": 1\n}' },
      auth: { type: "bearer", bearer: { token: "{{token}}" } },
      scripts: { tests: 'test("ok", () => expect(res.status).toBe(200));' },
    });
    const after = request({
      method: "POST",
      headers: [
        { name: "X-Api-Version", value: "2", enabled: true },
        { name: "Accept", value: "application/json", enabled: true },
      ],
      body: { type: "json", json: '{\n  "a": 2\n}' },
      auth: { type: "inherit" },
      scripts: { tests: 'test("ok", () => expect(res.status).toBe(201));' },
    });

    const sections = diffRequest(before, after);
    expect(sections.map(section => section.id)).toEqual([
      "method",
      "query",
      "headers",
      "body",
      "auth",
      "tests",
    ]);
    expect(sections.find(s => s.id === "method")!.items).toEqual([
      { kind: "changed", label: "", before: "GET", after: "POST" },
    ]);
    expect(sections.find(s => s.id === "query")!.items).toEqual([
      { kind: "removed", label: "limit", before: "10" },
    ]);
    expect(sections.find(s => s.id === "headers")!.items).toEqual([
      { kind: "changed", label: "X-Api-Version", before: "1", after: "2" },
    ]);
    expect(sections.find(s => s.id === "body")!.items[0].lines).toContainEqual({
      type: "added",
      text: '  "a": 2',
    });
    expect(sections.find(s => s.id === "auth")!.items).toEqual([
      { kind: "changed", label: "Type", before: "bearer", after: "inherit" },
      { kind: "removed", label: "Token", before: "{{token}}" },
    ]);
  });

  it("reports nothing for identical requests, even with headers in another order", () => {
    const same = request();
    const reordered = request({ headers: [...same.headers!].reverse() });
    expect(diffRequest(same, reordered)).toEqual([]);
  });

  it("marks everything added for a new file and removed for a deleted one", () => {
    const added = diffRequest(null, request());
    expect(added.find(s => s.id === "url")!.items).toEqual([
      { kind: "added", label: "", after: "{{base}}/users" },
    ]);
    expect(added.find(s => s.id === "headers")!.items.every(i => i.kind === "added")).toBe(true);

    const removed = diffRequest(request(), null);
    expect(removed.find(s => s.id === "method")!.items).toEqual([
      { kind: "removed", label: "", before: "GET" },
    ]);
  });

  it("compares the unknown fields the format preserves", () => {
    expect(diffRequest(request({ unknown: { x: 1 } }), request({ unknown: { x: 2 } }))).toEqual([
      { id: "other", items: [{ kind: "changed", label: "x", before: "1", after: "2" }] },
    ]);
  });
});

describe("diffFolder / diffEnvironment", () => {
  it("diffs a collection's auth, scripts and variables field by field", () => {
    const before: FolderFile = {
      wttp: 1,
      name: "Auth",
      seq: 1,
      variables: [{ name: "tenant", value: "a", enabled: true }],
    };
    const after: FolderFile = {
      ...before,
      auth: { type: "basic", basic: { username: "{{user}}", password: "{{pass}}" } },
      variables: [{ name: "tenant", value: "b", enabled: true }],
      scripts: { preRequest: "wttp.setVar('x', 1)" },
    };
    expect(diffFolder(before, after)).toEqual([
      {
        id: "auth",
        items: [
          { kind: "changed", label: "Type", before: "inherit", after: "basic" },
          { kind: "added", label: "Username", after: "{{user}}" },
          { kind: "added", label: "Password", after: "{{pass}}" },
        ],
      },
      { id: "variables", items: [{ kind: "changed", label: "tenant", before: "a", after: "b" }] },
      {
        id: "preRequest",
        items: [
          { kind: "added", label: "", lines: [{ type: "added", text: "wttp.setVar('x', 1)" }] },
        ],
      },
    ]);
  });

  it("diffs environment variables by name", () => {
    const before: EnvironmentFile = {
      wttp: 1,
      name: "dev",
      variables: [
        { name: "base", value: "http://a", enabled: true },
        { name: "key", value: "", enabled: true, secret: true },
      ],
    };
    const after: EnvironmentFile = {
      ...before,
      variables: [
        { name: "key", value: "", enabled: true, secret: true },
        { name: "base", value: "http://b", enabled: true },
      ],
    };
    expect(diffEnvironment(before, after)).toEqual([
      {
        id: "variables",
        items: [{ kind: "changed", label: "base", before: "http://a", after: "http://b" }],
      },
    ]);
  });
});

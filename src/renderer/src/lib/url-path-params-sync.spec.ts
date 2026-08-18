import { describe, expect, it } from "vitest";

import { parsePathParamNames, reconcilePathParams } from "./url-path-params-sync";

describe("parsePathParamNames", () => {
  it("returns an empty array when there is no path param", () => {
    expect(parsePathParamNames("https://api.dev/users")).toEqual([]);
  });

  it("extracts segment names in order, without duplicates", () => {
    expect(parsePathParamNames("{{base_url}}/users/:id/posts/:postId/:id")).toEqual([
      "id",
      "postId",
    ]);
  });

  it("ignores a colon that isn't followed by a valid identifier", () => {
    expect(parsePathParamNames("https://api.dev:8080/users")).toEqual([]);
  });
});

describe("reconcilePathParams", () => {
  it("creates a blank enabled row for a new name", () => {
    expect(reconcilePathParams(["id"], [])).toEqual([
      { name: "id", value: "", enabled: true, description: "" },
    ]);
  });

  it("preserves the value of a name that is still present", () => {
    const existing = [{ name: "id", value: "42", enabled: false, description: "note" }];
    expect(reconcilePathParams(["id"], existing)).toEqual(existing);
  });

  it("drops a row whose name is no longer in the url", () => {
    const existing = [{ name: "id", value: "42", enabled: true, description: "" }];
    expect(reconcilePathParams([], existing)).toEqual([]);
  });

  it("follows the order of names in the url, not the existing rows", () => {
    const existing = [
      { name: "postId", value: "2", enabled: true, description: "" },
      { name: "id", value: "1", enabled: true, description: "" },
    ];
    expect(reconcilePathParams(["id", "postId"], existing)).toEqual([
      { name: "id", value: "1", enabled: true, description: "" },
      { name: "postId", value: "2", enabled: true, description: "" },
    ]);
  });
});

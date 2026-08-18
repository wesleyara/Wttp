import type { FolderNode, RequestScripts } from "@shared";

import { describe, expect, it } from "vitest";

import { buildScriptChain, linksWithCode, orderForPhase } from "./scriptChain";

function folder(name: string, scripts?: RequestScripts): FolderNode {
  return {
    kind: "folder",
    path: name.toLowerCase(),
    name,
    seq: 1,
    data: { wttp: 1, name, seq: 1, scripts },
    children: [],
  };
}

describe("buildScriptChain", () => {
  it("puts the request first, then folders closest-first", () => {
    const chain = buildScriptChain({ preRequest: "own-pre" }, [
      folder("Users", { preRequest: "users-pre" }),
      folder("API", { preRequest: "api-pre" }),
    ]);
    expect(chain.map(link => link.source)).toEqual(["This request", "Users", "API"]);
  });
});

describe("orderForPhase", () => {
  const chain = buildScriptChain({ preRequest: "own" }, [folder("Users"), folder("API")]);

  it("runs preRequest outside-in: collection first, request last", () => {
    expect(orderForPhase(chain, "preRequest").map(link => link.source)).toEqual([
      "API",
      "Users",
      "This request",
    ]);
  });

  it("runs tests inside-out: request first, collection last", () => {
    expect(orderForPhase(chain, "tests").map(link => link.source)).toEqual([
      "This request",
      "Users",
      "API",
    ]);
  });
});

describe("linksWithCode", () => {
  it("skips links with no script for the given phase", () => {
    const chain = buildScriptChain({ preRequest: "own-pre" }, [
      folder("Users", { tests: "users-tests" }),
      folder("API"),
    ]);
    expect(linksWithCode(chain, "preRequest")).toEqual([
      { source: "This request", code: "own-pre" },
    ]);
    expect(linksWithCode(chain, "tests")).toEqual([{ source: "Users", code: "users-tests" }]);
  });

  it("skips a script that is only whitespace", () => {
    const chain = buildScriptChain({ preRequest: "   \n  " }, []);
    expect(linksWithCode(chain, "preRequest")).toEqual([]);
  });
});

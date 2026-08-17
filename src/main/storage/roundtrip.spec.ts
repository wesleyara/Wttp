import { readFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { parseEnvironment, parseFolder, parseRequest, parseWorkspace } from "./parser";
import {
  serializeEnvironment,
  serializeFolder,
  serializeRequest,
  serializeWorkspace,
} from "./serializer";

const fixture = (name: string): string => join(__dirname, "__fixtures__", name);

describe("round-trip: ler → serializar → bytes idênticos", () => {
  it("workspace", async () => {
    const original = await readFile(fixture("workspace.yaml"), "utf-8");
    expect(serializeWorkspace(parseWorkspace(original))).toBe(original);
  });

  it("folder", async () => {
    const original = await readFile(fixture("folder.yaml"), "utf-8");
    expect(serializeFolder(parseFolder(original))).toBe(original);
  });

  it("request", async () => {
    const original = await readFile(fixture("request.yaml"), "utf-8");
    expect(serializeRequest(parseRequest(original))).toBe(original);
  });

  it("environment", async () => {
    const original = await readFile(fixture("environment.yaml"), "utf-8");
    expect(serializeEnvironment(parseEnvironment(original))).toBe(original);
  });
});

describe("campos desconhecidos", () => {
  it("sobrevivem a um ciclo de leitura e escrita", async () => {
    const original = await readFile(fixture("workspace-unknown-field.yaml"), "utf-8");
    const parsed = parseWorkspace(original);

    expect(parsed.unknown).toEqual({ futureField: "from a newer version of Wttp" });
    expect(serializeWorkspace(parsed)).toBe(original);
  });
});

describe("diff mínimo", () => {
  it("alterar um único header muda uma única linha", async () => {
    const original = await readFile(fixture("request.yaml"), "utf-8");
    const parsed = parseRequest(original);

    const changed = {
      ...parsed,
      headers: parsed.headers?.map(header =>
        header.name === "X-Request-Id" ? { ...header, value: "{{$isoTimestamp}}" } : header,
      ),
    };

    const originalLines = original.split("\n");
    const changedLines = serializeRequest(changed).split("\n");

    expect(changedLines).toHaveLength(originalLines.length);
    const differing = originalLines.filter((line, i) => line !== changedLines[i]);
    expect(differing).toHaveLength(1);
    expect(differing[0]).toContain("X-Request-Id");
  });
});

describe("body multilinha", () => {
  it("permanece legível — bloco literal, não string escapada", () => {
    const yaml = serializeRequest({
      wttp: 1,
      name: "Create",
      seq: 1,
      method: "POST",
      url: "{{base_url}}/things",
      body: { type: "json", json: '{\n  "a": 1\n}\n' },
    });

    expect(yaml).toContain('body:\n  type: json\n  json: |\n    {\n      "a": 1\n    }\n');
    expect(yaml).not.toContain("\\n");
  });
});

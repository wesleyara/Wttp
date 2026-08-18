import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readWorkspaceDrafts, writeWorkspaceDrafts } from "./workspaceDrafts";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-workspace-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("workspaceDrafts", () => {
  it("devolve vazio quando o arquivo ainda não existe", async () => {
    expect(await readWorkspaceDrafts(root)).toEqual({});
  });

  it("devolve vazio quando o arquivo está corrompido", async () => {
    await fs.mkdir(join(root, ".wttp"), { recursive: true });
    await fs.writeFile(join(root, ".wttp", "drafts.json"), "{not json", "utf-8");
    expect(await readWorkspaceDrafts(root)).toEqual({});
  });

  it("faz round-trip byte-a-byte do que foi escrito", async () => {
    const drafts = {
      "users/list.req.yaml": {
        kind: "request" as const,
        data: { wttp: 1 as const, name: "List users", seq: 0, method: "GET" as const, url: "" },
      },
      users: {
        kind: "folder" as const,
        data: { wttp: 1 as const, name: "users", seq: 0, docs: "draft docs" },
      },
    };
    await writeWorkspaceDrafts(root, drafts);
    expect(await readWorkspaceDrafts(root)).toEqual(drafts);
  });

  it("grava sob .wttp/drafts.json, gitignored", async () => {
    await writeWorkspaceDrafts(root, {});
    const raw = await fs.readFile(join(root, ".wttp", "drafts.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual({});
  });
});

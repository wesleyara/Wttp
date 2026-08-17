import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readWorkspaceUiState, writeWorkspaceUiState } from "./workspaceUiState";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "wttp-workspace-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("workspaceUiState", () => {
  it("devolve o estado vazio quando o arquivo ainda não existe", async () => {
    const state = await readWorkspaceUiState(root);
    expect(state).toEqual({ expandedPaths: [], openTabs: [], activeTabPath: null });
  });

  it("faz round-trip byte-a-byte do que foi escrito", async () => {
    const state = {
      expandedPaths: ["users", "users/auth"],
      openTabs: [{ path: "users/list.req.yaml", pinned: true }],
      activeTabPath: "users/list.req.yaml",
    };
    await writeWorkspaceUiState(root, state);
    expect(await readWorkspaceUiState(root)).toEqual(state);
  });

  it("grava sob .wttp/ui-state.json, gitignored", async () => {
    await writeWorkspaceUiState(root, { expandedPaths: [], openTabs: [], activeTabPath: null });
    const raw = await fs.readFile(join(root, ".wttp", "ui-state.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual({ expandedPaths: [], openTabs: [], activeTabPath: null });
  });
});

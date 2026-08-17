import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readJsonFile, writeJsonFile } from "./jsonFile";

describe("jsonFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wttp-config-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns the fallback when the file does not exist", async () => {
    const result = await readJsonFile(dir, "missing.json", { a: 1 });
    expect(result).toEqual({ a: 1 });
  });

  it("round-trips a write followed by a read", async () => {
    await writeJsonFile(dir, "state.json", { a: 1, b: "x" });
    const result = await readJsonFile(dir, "state.json", { a: 0, b: "" });
    expect(result).toEqual({ a: 1, b: "x" });
  });

  it("merges a partial file over the fallback", async () => {
    await writeJsonFile(dir, "partial.json", { a: 2 });
    const result = await readJsonFile(dir, "partial.json", { a: 0, b: "default" });
    expect(result).toEqual({ a: 2, b: "default" });
  });

  it("falls back on corrupted JSON instead of throwing", async () => {
    await writeFile(join(dir, "corrupt.json"), "{not valid", "utf-8");
    const result = await readJsonFile(dir, "corrupt.json", { a: 1 });
    expect(result).toEqual({ a: 1 });
  });
});

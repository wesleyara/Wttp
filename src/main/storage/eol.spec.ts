import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyEol, detectEol, readEol, writeYamlAtomic } from "./eol";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), "wttp-eol-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("detectEol", () => {
  it("decide pela primeira quebra de linha", () => {
    expect(detectEol("a\r\nb\r\n")).toBe("\r\n");
    expect(detectEol("a\nb\n")).toBe("\n");
    expect(detectEol("a\r\nb\n")).toBe("\r\n");
    expect(detectEol("a\nb\r\n")).toBe("\n");
  });

  it("é LF quando o texto não tem quebra de linha", () => {
    expect(detectEol("")).toBe("\n");
    expect(detectEol("wttp: 1")).toBe("\n");
  });
});

describe("applyEol", () => {
  it("converte LF para CRLF sem duplicar um CRLF já existente", () => {
    expect(applyEol("a\nb\n", "\r\n")).toBe("a\r\nb\r\n");
    expect(applyEol("a\r\nb\n", "\r\n")).toBe("a\r\nb\r\n");
  });

  it("não mexe no texto quando o destino é LF", () => {
    expect(applyEol("a\nb\n", "\n")).toBe("a\nb\n");
  });
});

describe("readEol / writeYamlAtomic", () => {
  it("arquivo que não existe é LF", async () => {
    expect(await readEol(join(dir, "missing.yaml"))).toBe("\n");
  });

  it("regrava um arquivo CRLF em CRLF e um arquivo LF em LF", async () => {
    const crlf = join(dir, "crlf.yaml");
    const lf = join(dir, "lf.yaml");
    await fs.writeFile(crlf, "wttp: 1\r\nname: Old\r\n");
    await fs.writeFile(lf, "wttp: 1\nname: Old\n");

    await writeYamlAtomic(crlf, "wttp: 1\nname: New\n");
    await writeYamlAtomic(lf, "wttp: 1\nname: New\n");

    expect(await fs.readFile(crlf, "utf-8")).toBe("wttp: 1\r\nname: New\r\n");
    expect(await fs.readFile(lf, "utf-8")).toBe("wttp: 1\nname: New\n");
  });

  it("arquivo novo sai em LF", async () => {
    const path = join(dir, "new.yaml");
    await writeYamlAtomic(path, "wttp: 1\n");
    expect(await fs.readFile(path, "utf-8")).toBe("wttp: 1\n");
  });

  it("com eolSource, a cópia herda a quebra de linha do original", async () => {
    const source = join(dir, "source.yaml");
    await fs.writeFile(source, "wttp: 1\r\n");
    const copy = join(dir, "copy.yaml");

    await writeYamlAtomic(copy, "wttp: 1\nname: Copy\n", source);

    expect(await fs.readFile(copy, "utf-8")).toBe("wttp: 1\r\nname: Copy\r\n");
  });
});

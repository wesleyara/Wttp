import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteAttachment,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
  readAttachment,
  resolveAttachmentFile,
  saveAttachment,
} from "./attachments";
import { scanWorkspace } from "./tree";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "wttp-attachments-"));
  writeFileSync(join(root, "wttp.yaml"), "wttp: 1\nname: T\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

describe("saveAttachment", () => {
  it("writes into attachments/ with a content-hash suffix and a clean slug", async () => {
    const info = await saveAttachment(root, "Tela de Login (v2).PNG", png);
    expect(info.kind).toBe("image");
    expect(info.path).toMatch(/^attachments\/tela-de-login-v2-[0-9a-f]{8}\.png$/);
    expect(readFileSync(join(root, info.path))).toEqual(Buffer.from(png));
  });

  it("is idempotent: the same bytes attached twice is one file", async () => {
    const a = await saveAttachment(root, "a.png", png);
    const b = await saveAttachment(root, "a.png", png);
    expect(b.path).toBe(a.path);
    expect(readdirSync(join(root, "attachments"))).toHaveLength(1);
  });

  it("keeps different content with the same name as different files", async () => {
    const a = await saveAttachment(root, "a.png", png);
    const b = await saveAttachment(root, "a.png", new Uint8Array([9, 9, 9]));
    expect(b.path).not.toBe(a.path);
  });

  it("classifies video", async () => {
    expect((await saveAttachment(root, "demo.mp4", png)).kind).toBe("video");
    expect((await saveAttachment(root, "demo.webm", png)).kind).toBe("video");
  });

  it("rejects unsupported types, empty files and oversized files", async () => {
    await expect(saveAttachment(root, "evil.html", png)).rejects.toMatchObject({
      code: "ATTACHMENT_TYPE",
    });
    await expect(saveAttachment(root, "a.png", new Uint8Array())).rejects.toMatchObject({
      code: "ATTACHMENT_EMPTY",
    });
    await expect(
      saveAttachment(root, "big.mp4", new Uint8Array(MAX_ATTACHMENT_BYTES + 1)),
    ).rejects.toMatchObject({ code: "ATTACHMENT_TOO_LARGE" });
  });
});

describe("resolving and reading", () => {
  it("only serves files directly under attachments/ with an allowed type", async () => {
    const { path } = await saveAttachment(root, "a.png", png);
    expect(resolveAttachmentFile(root, path)).toBe(join(root, path));
    for (const bad of [
      "wttp.yaml",
      ".wttp/secrets.json",
      "attachments/../wttp.yaml",
      "attachments/../../etc/passwd.png",
      "attachments/sub/a.png",
      "attachments/notes.txt",
      "/etc/passwd",
    ]) {
      expect(() => resolveAttachmentFile(root, bad), bad).toThrow();
    }
  });

  it("reads bytes and mime; a missing file is a clear ENOENT", async () => {
    const { path } = await saveAttachment(root, "a.png", png);
    const read = await readAttachment(root, path);
    expect(read.mime).toBe("image/png");
    expect(Buffer.from(read.data)).toEqual(Buffer.from(png));
    await expect(readAttachment(root, "attachments/nope-00000000.png")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("workspace scan", () => {
  it("never shows attachments/ as a collection in the tree", async () => {
    mkdirSync(join(root, "users"));
    await saveAttachment(root, "a.png", png);
    const tree = await scanWorkspace(root);
    expect(tree.children.map(node => node.name)).toEqual(["users"]);
  });
});

describe("listAttachments / deleteAttachment", () => {
  it("lists only real attachments with their size, sorted; no directory is an empty list", async () => {
    expect(await listAttachments(root)).toEqual([]);
    const b = await saveAttachment(root, "b.png", png);
    const a = await saveAttachment(root, "a.mp4", new Uint8Array([1, 2]));
    writeFileSync(join(root, "attachments", "notes.txt"), "ignored");
    mkdirSync(join(root, "attachments", "sub"));
    expect(await listAttachments(root)).toEqual([
      { path: a.path, kind: "video", bytes: 2 },
      { path: b.path, kind: "image", bytes: png.length },
    ]);
  });

  it("deletes one attachment and refuses paths outside attachments/", async () => {
    const { path } = await saveAttachment(root, "a.png", png);
    await deleteAttachment(root, path);
    expect(await listAttachments(root)).toEqual([]);
    await expect(deleteAttachment(root, "wttp.yaml")).rejects.toMatchObject({
      code: "ATTACHMENT_PATH",
    });
  });
});

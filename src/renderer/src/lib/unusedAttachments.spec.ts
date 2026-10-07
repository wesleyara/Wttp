import type { AttachmentInfo, WorkspaceNode } from "@shared";

import { describe, expect, it } from "vitest";

import { docsInTree, findUnusedAttachments, referencedAttachments } from "./unusedAttachments";

const file = (name: string, kind: AttachmentInfo["kind"] = "image"): AttachmentInfo => ({
  path: `attachments/${name}`,
  kind,
  bytes: 10,
});

describe("findUnusedAttachments", () => {
  const all = [file("a-11111111.png"), file("b-22222222.png"), file("v-33333333.mp4", "video")];

  it("returns what no text mentions", () => {
    const texts = ["![a](attachments/a-11111111.png)", "intro"];
    expect(findUnusedAttachments(all, texts).map(i => i.path)).toEqual([
      "attachments/b-22222222.png",
      "attachments/v-33333333.mp4",
    ]);
  });

  it("counts any mention as use: plain links, code blocks, angle brackets and different case", () => {
    const texts = [
      "[spec](attachments/b-22222222.png)",
      "```\n![v](attachments/V-33333333.MP4)\n```",
      "![a](<attachments/a-11111111.png>)",
    ];
    expect(findUnusedAttachments(all, texts)).toEqual([]);
  });

  it("everything is unused when there are no docs, and nothing when there are no files", () => {
    expect(findUnusedAttachments(all, [])).toHaveLength(3);
    expect(findUnusedAttachments([], ["attachments/a-11111111.png"])).toEqual([]);
  });

  it("does not treat a similarly named file as the same attachment", () => {
    const used = referencedAttachments(["![x](attachments/a-11111111.png.bak)"]);
    expect(used.has("attachments/a-11111111.png")).toBe(false);
  });
});

describe("docsInTree", () => {
  it("collects docs from folders and requests, at any depth", () => {
    const tree = [
      {
        kind: "folder",
        path: "c",
        name: "c",
        seq: 1,
        data: { wttp: 1, name: "c", seq: 1, docs: "collection docs" },
        children: [
          {
            kind: "folder",
            path: "c/f",
            name: "f",
            seq: 1,
            data: null,
            children: [
              {
                kind: "request",
                path: "c/f/r.req.yaml",
                name: "r",
                seq: 1,
                data: { wttp: 1, name: "r", seq: 1, method: "GET", url: "/", docs: "request docs" },
              },
              { kind: "request", path: "c/f/bad.req.yaml", name: "bad", seq: 2, data: null },
            ],
          },
        ],
      },
    ] as WorkspaceNode[];
    expect(docsInTree(tree)).toEqual(["collection docs", "request docs"]);
  });
});

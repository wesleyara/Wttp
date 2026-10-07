import { describe, expect, it } from "vitest";

import {
  attachmentPathsIn,
  attachmentUrl,
  isAttachmentPath,
  rewriteAttachmentsInHtml,
} from "./markdownAttachments";

describe("isAttachmentPath", () => {
  it("accepts only direct attachments/ files of allowed types", () => {
    expect(isAttachmentPath("attachments/a-1a2b3c4d.png")).toBe(true);
    expect(isAttachmentPath("attachments/demo.MP4")).toBe(true);
    for (const bad of [
      "https://x.test/a.png",
      "attachments/../wttp.yaml",
      "attachments/sub/a.png",
      "attachments/a.html",
      "wttp.yaml",
      "attachments/a.png?x=1",
    ]) {
      expect(isAttachmentPath(bad), bad).toBe(false);
    }
  });
});

describe("attachmentPathsIn", () => {
  it("finds every referenced attachment once, ignoring plain links and external images", () => {
    const md =
      "![a](attachments/a-11111111.png) text ![v](attachments/v-22222222.mp4)\n![a again](attachments/a-11111111.png)\n![ext](https://x.test/i.png) [l](attachments/a-11111111.png)";
    expect(attachmentPathsIn(md)).toEqual([
      "attachments/a-11111111.png",
      "attachments/v-22222222.mp4",
    ]);
  });
});

describe("rewriteAttachmentsInHtml", () => {
  it("points images at the protocol and turns videos into <video controls>", () => {
    const html = rewriteAttachmentsInHtml(
      '<p><img src="attachments/a-11111111.png" alt="Login"> <img src="attachments/v-22222222.mp4" alt="Demo"></p>',
    );
    expect(html).toContain(
      `<img src="${attachmentUrl("attachments/a-11111111.png")}" alt="Login">`,
    );
    expect(html).toContain("<video controls");
    expect(html).toContain("v-22222222.mp4");
    expect(html).not.toContain('src="attachments/');
  });

  it("leaves external images and non-attachment paths alone", () => {
    const html = '<img src="https://x.test/i.png" alt="x"><img src="attachments/x.html" alt="y">';
    expect(rewriteAttachmentsInHtml(html)).toBe(html);
  });

  it("escapes alt text so it cannot inject markup", () => {
    const html = rewriteAttachmentsInHtml(
      '<img src="attachments/a-11111111.png" alt="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">',
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("lets the export resolver inline a data URI or omit the attachment", () => {
    const html = rewriteAttachmentsInHtml(
      '<img src="attachments/a-11111111.png" alt="A"><img src="attachments/v-22222222.mp4" alt="Big video">',
      path => (path.endsWith(".png") ? "data:image/png;base64,AAAA" : null),
    );
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain("data-attachment-omitted");
    expect(html).toContain("Big video");
    expect(html).not.toContain("<video");
  });
});

import { describe, expect, it } from "vitest";

import { inlineAttachment, MAX_INLINE_VIDEO_BYTES, toDataUri } from "./attachmentData";

describe("toDataUri", () => {
  it("encodes bytes as base64, including buffers larger than one chunk", () => {
    expect(toDataUri("image/png", new Uint8Array([104, 105]))).toBe("data:image/png;base64,aGk=");
    const big = new Uint8Array(100_000).fill(65);
    const uri = toDataUri("image/png", big);
    expect(atob(uri.split(",")[1])).toBe("A".repeat(100_000));
  });
});

describe("inlineAttachment", () => {
  it("inlines images of any size and small videos", () => {
    expect(inlineAttachment("attachments/a.png", "image/png", new Uint8Array(20_000_000))).toMatch(
      /^data:image\/png/,
    );
    expect(inlineAttachment("attachments/a.mp4", "video/mp4", new Uint8Array(10))).toMatch(
      /^data:video\/mp4/,
    );
  });

  it("omits a video over the limit", () => {
    expect(
      inlineAttachment(
        "attachments/a.mp4",
        "video/mp4",
        new Uint8Array(MAX_INLINE_VIDEO_BYTES + 1),
      ),
    ).toBeNull();
  });
});

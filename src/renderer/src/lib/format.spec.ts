import { describe, expect, it } from "vitest";

import { formatBytes, formatDuration } from "./format";

describe("formatBytes", () => {
  it("keeps small values in bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("switches units at 1024", () => {
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(1536)).toBe("1.50 KB");
  });

  it("goes up to GB and reduces decimals as the number grows", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
    expect(formatBytes(123 * 1024 * 1024)).toBe("123 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
  });
});

describe("formatDuration", () => {
  it("shows milliseconds under a second", () => {
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(342.7)).toBe("343 ms");
  });

  it("switches to seconds at 1000ms", () => {
    expect(formatDuration(1000)).toBe("1.00 s");
    expect(formatDuration(2345)).toBe("2.35 s");
  });
});

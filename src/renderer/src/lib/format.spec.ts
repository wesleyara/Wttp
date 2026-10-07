import { describe, expect, it } from "vitest";

import { formatBytes, formatDuration, formatRelativeTime } from "./format";

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

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const ago = (seconds: number): number => now - seconds * 1000;

  it("uses the largest whole unit, in the given locale", () => {
    expect(formatRelativeTime(ago(30), "en", now)).toBe("now");
    expect(formatRelativeTime(ago(5 * 60), "en", now)).toBe("5 minutes ago");
    expect(formatRelativeTime(ago(3 * 3600), "en", now)).toBe("3 hours ago");
    expect(formatRelativeTime(ago(2 * 86400), "en", now)).toBe("2 days ago");
    expect(formatRelativeTime(ago(3 * 86400), "pt-BR", now)).toBe("há 3 dias");
    expect(formatRelativeTime(ago(400 * 86400), "en", now)).toBe("last year");
  });
});

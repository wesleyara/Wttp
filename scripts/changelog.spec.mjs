import { describe, expect, it } from "vitest";

import { extractSection, insertRelease, normalizeVersion } from "./changelog.mjs";

const changelog = `# Changelog

Intro.

## [Unreleased]

- leftover note

## [0.2.0](https://example.test/compare/v0.1.0...v0.2.0) - 2026-09-24

Second.

### Added

- B

## [0.1.0](https://example.test/releases/tag/v0.1.0) - 2026-08-20

### Added

- A
`;

describe("normalizeVersion", () => {
  it("strips a leading v", () => {
    expect(normalizeVersion("v1.2.3")).toBe("1.2.3");
    expect(normalizeVersion("1.2.3")).toBe("1.2.3");
  });
});

describe("extractSection", () => {
  it("returns the body of a version between its heading and the next one", () => {
    expect(extractSection(changelog, "v0.2.0")).toBe("Second.\n\n### Added\n\n- B");
  });

  it("returns the last version up to the end of the file", () => {
    expect(extractSection(changelog, "0.1.0")).toBe("### Added\n\n- A");
  });

  it("returns null for a version that is not there", () => {
    expect(extractSection(changelog, "9.9.9")).toBeNull();
  });

  it("does not match a version that is only a prefix of another", () => {
    expect(extractSection(changelog, "0.2")).toBeNull();
  });
});

describe("insertRelease", () => {
  const section =
    "## [0.3.0](https://example.test/compare/v0.2.0...v0.3.0) - 2026-09-25\n\n### Added\n\n- C\n";

  it("puts the new version right below Unreleased, replacing what was there", () => {
    const result = insertRelease(changelog, section);
    expect(result).toContain("## [Unreleased]\n\n## [0.3.0]");
    expect(result).not.toContain("leftover note");
    expect(extractSection(result, "0.3.0")).toBe("### Added\n\n- C");
    expect(extractSection(result, "0.2.0")).toBe("Second.\n\n### Added\n\n- B");
  });

  it("refuses a version that already exists", () => {
    expect(() => insertRelease(changelog, "## [0.2.0] - x\n")).toThrow(/already has/);
  });

  it("refuses a section without a version heading", () => {
    expect(() => insertRelease(changelog, "## [Unreleased]\n")).toThrow();
    expect(() => insertRelease(changelog, "- nothing\n")).toThrow(/no version heading/);
  });

  it("refuses a changelog without an Unreleased heading", () => {
    expect(() => insertRelease("# Changelog\n", section)).toThrow(/Unreleased/);
  });
});

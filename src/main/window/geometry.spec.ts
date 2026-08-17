import { describe, expect, it } from "vitest";

import { isRectOnScreen } from "./geometry";

const display = { x: 0, y: 0, width: 1920, height: 1080 };

describe("isRectOnScreen", () => {
  it("is on screen when fully inside a display", () => {
    expect(isRectOnScreen({ x: 100, y: 100, width: 800, height: 600 }, [display])).toBe(true);
  });

  it("is on screen when substantially overlapping a display edge", () => {
    expect(isRectOnScreen({ x: -50, y: 100, width: 800, height: 600 }, [display])).toBe(true);
  });

  it("is off screen when only a sliver overlaps", () => {
    expect(isRectOnScreen({ x: -790, y: 100, width: 800, height: 600 }, [display])).toBe(false);
  });

  it("is off screen with no displays", () => {
    expect(isRectOnScreen({ x: 100, y: 100, width: 800, height: 600 }, [])).toBe(false);
  });

  it("checks against any of multiple displays", () => {
    const second = { x: 1920, y: 0, width: 1920, height: 1080 };
    expect(isRectOnScreen({ x: 2000, y: 100, width: 800, height: 600 }, [display, second])).toBe(
      true,
    );
  });
});

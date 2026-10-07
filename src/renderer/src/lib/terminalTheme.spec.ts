import { describe, expect, it } from "vitest";

import { tokenToRgb } from "./terminalTheme";

describe("tokenToRgb", () => {
  it("converts a space-separated token into an rgb() color", () => {
    expect(tokenToRgb(" 44 62 80 ")).toBe("rgb(44, 62, 80)");
  });

  it("adds alpha when given", () => {
    expect(tokenToRgb("10 133 191", 0.3)).toBe("rgba(10, 133, 191, 0.3)");
  });
});

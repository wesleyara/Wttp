import { describe, expect, it } from "vitest";

import { isHtml, isImage, isPdf, isTextual, suggestedFileName } from "./content-type";

describe("isTextual", () => {
  it("accepts common text and structured types", () => {
    expect(isTextual("application/json")).toBe(true);
    expect(isTextual("application/json; charset=utf-8")).toBe(true);
    expect(isTextual("text/html")).toBe(true);
    expect(isTextual("application/vnd.api+json")).toBe(true);
  });

  it("rejects binary types", () => {
    expect(isTextual("image/png")).toBe(false);
    expect(isTextual("application/octet-stream")).toBe(false);
    expect(isTextual("application/pdf")).toBe(false);
  });
});

describe("isImage / isPdf / isHtml", () => {
  it("classifies by base type, ignoring parameters", () => {
    expect(isImage("image/png; charset=binary")).toBe(true);
    expect(isPdf("application/pdf")).toBe(true);
    expect(isHtml("text/html; charset=utf-8")).toBe(true);
    expect(isHtml("text/plain")).toBe(false);
  });
});

describe("suggestedFileName", () => {
  it("maps known types to an extension", () => {
    expect(suggestedFileName("application/json")).toBe("response.json");
    expect(suggestedFileName("image/png")).toBe("response.png");
  });

  it("falls back to .bin for unknown types", () => {
    expect(suggestedFileName("application/x-custom")).toBe("response.bin");
  });
});

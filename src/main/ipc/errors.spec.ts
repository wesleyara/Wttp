import { describe, expect, it } from "vitest";

import { DomainError, throwableWttpError, toWttpError } from "./errors";

// Teste trivial do EP-01-T07: prova que Vitest roda `src/main/` puro, sem subir o
// Electron.
describe("toWttpError", () => {
  it("preserves code, message and detail from a DomainError", () => {
    const error = new DomainError("ENOENT", "File not found", "/tmp/missing.yml");

    expect(toWttpError(error)).toEqual({
      code: "ENOENT",
      message: "File not found",
      detail: "/tmp/missing.yml",
    });
  });

  it("falls back to UNKNOWN for a plain Error", () => {
    expect(toWttpError(new Error("boom"))).toEqual({ code: "UNKNOWN", message: "boom" });
  });

  it("falls back to UNKNOWN for a non-Error throw", () => {
    expect(toWttpError("boom")).toEqual({ code: "UNKNOWN", message: "Unexpected error" });
  });
});

describe("throwableWttpError", () => {
  it("round-trips a WttpError through JSON in the message", () => {
    const error = new DomainError("SCRIPT_TIMEOUT", "Script exceeded 5s");
    const thrown = throwableWttpError(error);

    expect(JSON.parse(thrown.message)).toEqual({
      code: "SCRIPT_TIMEOUT",
      message: "Script exceeded 5s",
    });
  });
});

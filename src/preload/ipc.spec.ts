import type { WttpError } from "@shared";

import { describe, expect, it } from "vitest";

import { unwrapWttpError } from "./ipc";

// `ipcRenderer.invoke` prefixa a mensagem do erro rejeitado com
// `Error invoking remote method 'canal': Error: <json>` — regressão real encontrada
// ao verificar o critério de aceite da EP-01-T04 manualmente na app empacotada.
describe("unwrapWttpError", () => {
  it("extracts the WttpError from an ipcRenderer.invoke-style prefixed message", () => {
    const raw = new Error(
      `Error invoking remote method 'app:ping': Error: ${JSON.stringify({
        code: "SCRIPT_TIMEOUT",
        message: "temporary test error",
        detail: "verifying WttpError shape",
      })}`,
    );

    expect(() => unwrapWttpError(raw)).toThrowError(
      expect.objectContaining({
        code: "SCRIPT_TIMEOUT",
        message: "temporary test error",
        detail: "verifying WttpError shape",
      } satisfies WttpError),
    );
  });

  it("falls back to UNKNOWN with the raw message when there's no embedded JSON", () => {
    const raw = new Error("plain Node error, no WttpError inside");

    expect(() => unwrapWttpError(raw)).toThrowError(
      expect.objectContaining({
        code: "UNKNOWN",
        message: "plain Node error, no WttpError inside",
      } satisfies WttpError),
    );
  });
});

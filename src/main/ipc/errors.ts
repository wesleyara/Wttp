import type { WttpError, WttpErrorCode } from "@shared";

/**
 * Erro de domínio, lançável nas camadas de baixo (`http/`, `storage/`, `importers/`)
 * sem depender de Electron. `registerHandler` converte qualquer coisa lançada em um
 * `WttpError` antes de deixá-la atravessar o IPC.
 */
export class DomainError extends Error {
  readonly code: WttpErrorCode;
  readonly detail?: string;

  constructor(code: WttpErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.detail = detail;
  }
}

export function toWttpError(error: unknown): WttpError {
  if (error instanceof DomainError) {
    return { code: error.code, message: error.message, detail: error.detail };
  }
  if (error instanceof Error) {
    return { code: "UNKNOWN", message: error.message };
  }
  return { code: "UNKNOWN", message: "Unexpected error" };
}

/**
 * `ipcMain.handle` só propaga a `message` de um `Error` lançado no handler — o resto
 * do objeto se perde na serialização. Empacotamos o `WttpError` inteiro como JSON
 * dentro da `message`; o preload desempacota do outro lado (`unwrapWttpError`).
 */
export function throwableWttpError(error: unknown): Error {
  return new Error(JSON.stringify(toWttpError(error)));
}

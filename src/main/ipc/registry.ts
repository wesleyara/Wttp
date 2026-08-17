import type { IpcChannel, IpcPayload, IpcResult } from "@shared";

import { ipcMain } from "electron";

import { throwableWttpError } from "./errors";

/**
 * Registra um handler `invoke` tipado pelo `IpcContract`. Fino por definição: quem
 * chama esta função deve só validar o payload e delegar — a regra de negócio vive em
 * `http/`, `storage/` ou `importers/`, testáveis sem Electron.
 */
export function registerHandler<C extends IpcChannel>(
  channel: C,
  fn: (payload: IpcPayload<C>) => IpcResult<C> | Promise<IpcResult<C>>,
): void {
  ipcMain.handle(channel, async (_event, payload: IpcPayload<C>) => {
    try {
      return await fn(payload);
    } catch (error) {
      throw throwableWttpError(error);
    }
  });
}

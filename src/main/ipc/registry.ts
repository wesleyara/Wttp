import type { IpcChannel, IpcPayload, IpcResult } from "@shared";
import type { IpcMainInvokeEvent } from "electron";

import { ipcMain } from "electron";

import { throwableWttpError } from "./errors";

/**
 * Registra um handler `invoke` tipado pelo `IpcContract`. Fino por definição: quem
 * chama esta função deve só validar o payload e delegar — a regra de negócio vive em
 * `http/`, `storage/` ou `importers/`, testáveis sem Electron.
 *
 * O `event` é repassado para quem precisa emitir um evento contínuo associado à mesma
 * chamada (ex: `http:progress` em `http:send`) via `event.sender.send`.
 */
export function registerHandler<C extends IpcChannel>(
  channel: C,
  fn: (payload: IpcPayload<C>, event: IpcMainInvokeEvent) => IpcResult<C> | Promise<IpcResult<C>>,
): void {
  ipcMain.handle(channel, async (event, payload: IpcPayload<C>) => {
    try {
      return await fn(payload, event);
    } catch (error) {
      throw throwableWttpError(error);
    }
  });
}

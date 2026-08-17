import type { IpcChannel, IpcPayload, IpcResult, WttpError } from "@shared";

import { ipcRenderer } from "electron";

function isWttpError(value: unknown): value is WttpError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

/**
 * `ipcMain.handle` só entrega a `message` de um `Error` lançado no handler; o main
 * (`src/main/ipc/errors.ts`) empacota o `WttpError` como JSON dentro dela. Aqui
 * desempacotamos — se não for um JSON de `WttpError`, o renderer recebe `UNKNOWN` em
 * vez da mensagem crua do Node.
 *
 * `ipcRenderer.invoke` ainda prefixa a mensagem com
 * `Error invoking remote method 'canal': Error: <json>` — por isso extraímos só o
 * trecho entre chaves em vez de fazer `JSON.parse` na mensagem inteira.
 */
export function unwrapWttpError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const jsonMatch = /\{.*\}/s.exec(message);
  if (jsonMatch) {
    try {
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (isWttpError(parsed)) throw parsed;
    } catch (parseError) {
      if (isWttpError(parseError)) throw parseError;
    }
  }
  throw { code: "UNKNOWN", message } satisfies WttpError;
}

/** `invoke` tipado pelo `IpcContract` — a única forma pela qual o preload fala com o main. */
export async function invoke<C extends IpcChannel>(
  channel: C,
  payload?: IpcPayload<C>,
): Promise<IpcResult<C>> {
  try {
    return await ipcRenderer.invoke(channel, payload);
  } catch (error) {
    return unwrapWttpError(error);
  }
}

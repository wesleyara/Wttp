import { appendHistory, deleteHistoryFile, readHistory } from "../storage/history";
import { registerHandler } from "./registry";

export function registerHistoryHandlers(): void {
  registerHandler("history:list", payload => readHistory(payload.root, payload.path));

  registerHandler("history:append", payload =>
    appendHistory(payload.root, payload.path, {
      request: payload.request,
      response: payload.response,
      secrets: payload.secrets,
    }),
  );

  registerHandler("history:clear", payload => deleteHistoryFile(payload.root, payload.path));
}

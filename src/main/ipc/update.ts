import { checkForUpdatesNow, getCurrentStatus, installUpdate } from "../update/updater";
import { registerHandler } from "./registry";

export function registerUpdateHandlers(): void {
  registerHandler("update:getStatus", () => getCurrentStatus());
  registerHandler("update:check", () => checkForUpdatesNow());
  registerHandler("update:install", () => installUpdate());
}

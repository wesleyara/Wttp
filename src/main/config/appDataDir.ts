import { app } from "electron";

/** Diretório de config do app (`ui-state.json`, `settings.json`) — nunca o workspace. */
export function appDataDir(): string {
  return app.getPath("userData");
}

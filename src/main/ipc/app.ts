import type { AppInfo } from "@shared";

import { app } from "electron";

import { registerHandler } from "./registry";

export function registerAppHandlers(): void {
  registerHandler("app:ping", (): AppInfo => {
    return { version: app.getVersion(), platform: process.platform };
  });
}

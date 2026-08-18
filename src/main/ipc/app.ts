import type { AppInfo } from "@shared";

import { app, shell } from "electron";

import { DomainError } from "./errors";
import { registerHandler } from "./registry";

/**
 * URLs que `app:openExternal` pode abrir no browser do SO (EP-08.1-T05, adiantado do
 * escopo original de EP-08.1-T07) — nunca confia no que o renderer manda sem checar.
 * `/tree/main/docs` é o destino provisório do link "Documentation" nas Preferências
 * até EP-08.1-T07 publicar o site de verdade.
 */
const ALLOWED_EXTERNAL_URLS = [
  "https://github.com/wesleyara/Wttp",
  "https://github.com/wesleyara/Wttp/issues",
  "https://github.com/wesleyara/Wttp/tree/main/docs",
];

export function isAllowedExternalUrl(url: string): boolean {
  return ALLOWED_EXTERNAL_URLS.some(allowed => url === allowed || url.startsWith(`${allowed}/`));
}

export function registerAppHandlers(): void {
  registerHandler("app:ping", (): AppInfo => {
    return { version: app.getVersion(), platform: process.platform };
  });

  registerHandler("app:openExternal", async payload => {
    if (!isAllowedExternalUrl(payload.url)) {
      throw new DomainError("INVALID_PAYLOAD", `URL not allowed: "${payload.url}"`, payload.url);
    }
    await shell.openExternal(payload.url);
  });
}

import type { AppInfo } from "@shared";

import { app, shell } from "electron";

import { docsAvailable, openDocsWindow } from "../docs/docsWindow";
import { DomainError } from "./errors";
import { isAllowedExternalUrl } from "./externalUrls";
import { registerHandler } from "./registry";

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

  registerHandler("app:openDocs", payload => {
    if (payload.locale !== "en" && payload.locale !== "pt-BR") {
      throw new DomainError("INVALID_PAYLOAD", `Unknown docs locale: "${payload.locale}"`);
    }
    if (!docsAvailable()) {
      throw new DomainError(
        "ENOENT",
        "Bundled documentation not found — run `yarn docs:build:offline` first.",
      );
    }
    openDocsWindow(payload.locale);
  });
}

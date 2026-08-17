import type { WorkspaceTree } from "@shared";

import { BrowserWindow, dialog } from "electron";
import { basename } from "node:path";

import { listRecentWorkspaces, touchRecentWorkspace } from "../storage/recentWorkspaces";
import { initWorkspace, scanWorkspace } from "../storage/tree";
import { registerHandler } from "./registry";

export function registerWorkspaceHandlers(): void {
  registerHandler("workspace:open", async (payload, event) => {
    let path = payload.path;

    if (!path) {
      const win = BrowserWindow.fromWebContents(event.sender);
      const options = { properties: ["openDirectory" as const] };
      const { canceled, filePaths } = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (canceled || filePaths.length === 0) return null;
      path = filePaths[0];
    }

    const tree: WorkspaceTree = await scanWorkspace(path);
    await touchRecentWorkspace(path, tree.data?.name ?? basename(path));
    return tree;
  });

  registerHandler("workspace:create", async payload => {
    const tree = await initWorkspace(payload.path, payload.name);
    await touchRecentWorkspace(payload.path, payload.name);
    return tree;
  });

  registerHandler("workspace:recent", () => listRecentWorkspaces());
}

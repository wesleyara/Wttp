import type { WorkspaceTree } from "@shared";

import { BrowserWindow, dialog, type WebContents } from "electron";
import { basename } from "node:path";

import { setActiveWorkspaceRoot } from "../storage/activeWorkspace";
import {
  listRecentWorkspacesWithStatus,
  removeRecentWorkspace,
  touchRecentWorkspace,
} from "../storage/recentWorkspaces";
import {
  initWorkspace,
  listWorkspacesInDir,
  scanWorkspace,
  updateWorkspaceVariables,
} from "../storage/tree";
import { watchWorkspace, type WorkspaceWatcher } from "../storage/watcher";
import { readWorkspaceDrafts, writeWorkspaceDrafts } from "../storage/workspaceDrafts";
import { readWorkspaceUiState, writeWorkspaceUiState } from "../storage/workspaceUiState";
import { registerHandler } from "./registry";

/**
 * Um workspace aberto por vez (hoje o app tem uma única janela) — trocar de workspace
 * fecha o watcher anterior antes de abrir o novo, para nunca vazar um `fs.watch` ativo
 * numa raiz que a UI já não olha mais.
 */
let activeWatcher: WorkspaceWatcher | null = null;

function startWatching(root: string, sender: WebContents): void {
  activeWatcher?.close();
  activeWatcher = null;

  try {
    activeWatcher = watchWorkspace(
      root,
      event => {
        if (!sender.isDestroyed()) sender.send("workspace:changed", event);
      },
      error => {
        // Falha assíncrona (ex: ENOSPC do limite de inotify do SO) — o workspace
        // continua funcionando, só sem live-reload de edições externas.
        console.error(`workspace watcher for "${root}" stopped`, error);
        activeWatcher = null;
      },
    );
  } catch (error) {
    // Plataforma sem suporte a watch recursivo: o workspace continua funcionando,
    // só sem live-reload de edições externas.
    console.error(`failed to watch workspace "${root}"`, error);
  }
}

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
    setActiveWorkspaceRoot(path);
    startWatching(path, event.sender);
    return tree;
  });

  registerHandler("workspace:create", async (payload, event) => {
    const tree = await initWorkspace(payload.path, payload.name);
    await touchRecentWorkspace(payload.path, payload.name);
    setActiveWorkspaceRoot(payload.path);
    startWatching(payload.path, event.sender);
    return tree;
  });

  registerHandler("workspace:recent", () => listRecentWorkspacesWithStatus());

  registerHandler("workspace:removeRecent", payload => removeRecentWorkspace(payload.path));

  registerHandler("workspace:rescan", payload => scanWorkspace(payload.root));

  registerHandler("workspace:getUiState", payload => readWorkspaceUiState(payload.root));

  registerHandler("workspace:setUiState", payload =>
    writeWorkspaceUiState(payload.root, payload.state),
  );

  registerHandler("workspace:getDrafts", payload => readWorkspaceDrafts(payload.root));

  registerHandler("workspace:setDrafts", payload =>
    writeWorkspaceDrafts(payload.root, payload.drafts),
  );

  registerHandler("workspace:setVariables", payload =>
    updateWorkspaceVariables(payload.root, payload.variables),
  );

  registerHandler("workspace:listInDir", payload => listWorkspacesInDir(payload.dir));
}

import { shell } from "electron";

import { deleteHistoryFile, renameHistoryFile } from "../storage/history";
import { resolveWorkspacePath } from "../storage/paths";
import {
  createNode,
  deleteNode,
  duplicateNode,
  moveNode,
  moveNodeInto,
  readNode,
  renameNode,
  writeNode,
} from "../storage/tree";
import { registerHandler } from "./registry";

export function registerNodeHandlers(): void {
  registerHandler("node:read", payload => readNode(payload.root, payload.path));
  registerHandler("node:write", payload => writeNode(payload.root, payload.path, payload.node));
  registerHandler("node:move", payload =>
    moveNode(payload.root, payload.from, payload.to, payload.seq),
  );
  registerHandler("node:delete", async payload => {
    await deleteNode(payload.root, payload.path);
    // Sem histórico prévio (pasta, ou request que nunca enviou nada) é um no-op —
    // não deixa órfão em `.wttp/history/` (EP-08.1-T03).
    await deleteHistoryFile(payload.root, payload.path);
  });

  registerHandler("node:create", payload =>
    createNode(payload.root, payload.parentPath, payload.kind, payload.name),
  );
  registerHandler("node:rename", async payload => {
    const node = await renameNode(payload.root, payload.path, payload.name);
    if (node.path !== payload.path) {
      await renameHistoryFile(payload.root, payload.path, node.path);
    }
    return node;
  });
  registerHandler("node:duplicate", payload => duplicateNode(payload.root, payload.path));
  registerHandler("node:moveInto", payload =>
    moveNodeInto(payload.root, payload.from, payload.targetDir, payload.index),
  );

  registerHandler("node:reveal", payload => {
    shell.showItemInFolder(resolveWorkspacePath(payload.root, payload.path));
  });

  /**
   * Move para a lixeira do SO em vez de apagar direto — fallback avisado para
   * `deleteNode` (apagamento definitivo) se a plataforma não suportar lixeira, mesmo
   * padrão de fallback avisado de `secrets/store.ts` para criptografia ausente.
   */
  registerHandler("node:trash", async payload => {
    const absPath = resolveWorkspacePath(payload.root, payload.path);
    try {
      await shell.trashItem(absPath);
    } catch (error) {
      console.warn(`wttp: trash unavailable, deleting "${absPath}" permanently`, error);
      await deleteNode(payload.root, payload.path);
    }
    await deleteHistoryFile(payload.root, payload.path);
  });
}

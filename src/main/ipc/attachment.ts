import type { AttachmentInfo, TrashAttachmentsResult } from "@shared";

import { BrowserWindow, dialog, shell } from "electron";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import {
  ATTACHMENT_EXTENSIONS,
  deleteAttachment,
  listAttachments,
  readAttachment,
  resolveAttachmentFile,
  saveAttachment,
} from "../storage/attachments";
import { registerHandler } from "./registry";

/**
 * Anexos da documentação (EP-12): fino de propósito — diálogo nativo + `storage/attachments`.
 * Quem valida tipo, tamanho e caminho é o storage, não este handler.
 */
export function registerAttachmentHandlers(): void {
  registerHandler("attachment:save", payload =>
    saveAttachment(payload.root, payload.name, payload.data),
  );

  registerHandler("attachment:pick", async (payload, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      properties: ["openFile" as const, "multiSelections" as const],
      filters: [{ name: "Images and videos", extensions: ATTACHMENT_EXTENSIONS }],
    };
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (canceled || filePaths.length === 0) return { canceled: true, files: [] };

    const files: AttachmentInfo[] = [];
    for (const filePath of filePaths) {
      files.push(await saveAttachment(payload.root, basename(filePath), await readFile(filePath)));
    }
    return { canceled: false, files };
  });

  registerHandler("attachment:read", payload => readAttachment(payload.root, payload.path));

  registerHandler("attachment:list", payload => listAttachments(payload.root));

  /**
   * Limpeza de anexos não usados: lixeira do SO, nunca `unlink` de cara — mesmo fallback
   * avisado de `node:trash` quando a lixeira não existe, mas aqui o resultado diz quais
   * foram apagados de vez, para a UI não prometer "recuperável" sem ser.
   */
  registerHandler("attachment:trash", async payload => {
    const result: TrashAttachmentsResult = { trashed: [], deleted: [], failed: [] };
    for (const path of payload.paths) {
      try {
        const absolute = resolveAttachmentFile(payload.root, path);
        try {
          await shell.trashItem(absolute);
          result.trashed.push(path);
        } catch (error) {
          console.warn(`wttp: trash unavailable, deleting "${absolute}" permanently`, error);
          await deleteAttachment(payload.root, path);
          result.deleted.push(path);
        }
      } catch {
        result.failed.push(path);
      }
    }
    return result;
  });
}

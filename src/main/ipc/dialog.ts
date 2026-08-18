import { BrowserWindow, dialog } from "electron";
import { readFile, writeFile } from "node:fs/promises";

import { registerHandler } from "./registry";

/**
 * Salvar em disco (EP-03-T07) — o único jeito de o renderer escrever um arquivo. Fino
 * de propósito: diálogo nativo + `writeFile`, sem regra de negócio própria.
 */
export function registerDialogHandlers(): void {
  registerHandler("dialog:saveFile", async (payload, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { defaultPath: payload.suggestedName };
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (canceled || !filePath) return { canceled: true };

    await writeFile(filePath, Buffer.from(payload.data));
    return { canceled: false, path: filePath };
  });

  /** Escolher a pasta onde criar um workspace novo (EP-05-T01) — não abre nada, só devolve o path. */
  registerHandler("dialog:pickFolder", async (payload, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      defaultPath: payload.defaultPath,
      properties: ["openDirectory" as const, "createDirectory" as const],
    };
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (canceled || filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: filePaths[0] };
  });

  /** Escolher um arquivo para importar (EP-08-T06) — devolve o conteúdo já lido como texto. */
  registerHandler("dialog:pickFile", async (payload, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      properties: ["openFile" as const],
      filters: payload.extensions
        ? [{ name: "Import files", extensions: payload.extensions }]
        : undefined,
    };
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (canceled || filePaths.length === 0) return { canceled: true };

    const content = await readFile(filePaths[0], "utf-8");
    return { canceled: false, path: filePaths[0], content };
  });
}

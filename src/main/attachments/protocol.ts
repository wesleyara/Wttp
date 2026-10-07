import { net, protocol } from "electron";
import { pathToFileURL } from "node:url";

import { getActiveWorkspaceRoot } from "../storage/activeWorkspace";
import { resolveAttachmentFile } from "../storage/attachments";

/**
 * `wttp-attachment://workspace/attachments/<arquivo>` (EP-12): é como a prévia de markdown
 * mostra imagem e toca vídeo guardados no workspace. A CSP do renderer só aceita `'self'`,
 * então `file://` não serve — e um protocolo próprio permite *streaming* com `Range`, que o
 * `<video>` precisa para pular no tempo. Só serve `attachments/` do workspace ativo, nos
 * tipos permitidos: nunca um YAML nem `.wttp/secrets.json`.
 */
export const ATTACHMENT_SCHEME = "wttp-attachment";
const ATTACHMENT_HOST = "workspace";

/** Privilégios para o `registerSchemesAsPrivileged` único do bootstrap (antes de `ready`). */
export const attachmentSchemePrivileges = {
  scheme: ATTACHMENT_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
};

let registered = false;

export function registerAttachmentProtocol(): void {
  if (registered) return;
  registered = true;
  protocol.handle(ATTACHMENT_SCHEME, async request => {
    const root = getActiveWorkspaceRoot();
    const url = new URL(request.url);
    if (!root || url.host !== ATTACHMENT_HOST) return new Response("Not found", { status: 404 });

    let file: string;
    try {
      file = resolveAttachmentFile(root, decodeURIComponent(url.pathname.slice(1)));
    } catch {
      return new Response("Not found", { status: 404 });
    }
    // `net.fetch` de `file://` já responde `Range` e `Content-Type`. Anexo apagado (ou ilegível)
    // rejeitaria com `ERR_UNEXPECTED`: vira 404, como qualquer outro caminho inexistente.
    try {
      return await net.fetch(pathToFileURL(file).toString(), { headers: request.headers });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

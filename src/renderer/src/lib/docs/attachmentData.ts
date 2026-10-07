/**
 * Anexos dentro do HTML exportado (EP-12-T03): o arquivo precisa abrir offline e sozinho,
 * então imagem vira `data:` URI. Vídeo também, mas só até `MAX_INLINE_VIDEO_BYTES` — acima
 * disso o arquivo exportado ficaria enorme, e o player é trocado por um aviso.
 */

import { isVideoPath } from "@renderer/lib/markdownAttachments";

export const MAX_INLINE_VIDEO_BYTES = 8 * 1024 * 1024;

export function toDataUri(mime: string, data: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < data.length; offset += chunk) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/** URL embutida do anexo, ou `null` quando deve ser omitido (vídeo grande demais). */
export function inlineAttachment(path: string, mime: string, data: Uint8Array): string | null {
  if (isVideoPath(path) && data.length > MAX_INLINE_VIDEO_BYTES) return null;
  return toDataUri(mime, data);
}

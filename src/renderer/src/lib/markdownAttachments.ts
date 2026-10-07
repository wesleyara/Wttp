/**
 * Anexos de documentação no HTML renderizado (EP-12): o markdown guarda um caminho relativo
 * (`attachments/foo-1a2b3c4d.png`, arch-docs/file-format.md §9); aqui ele vira o que o
 * Chromium consegue carregar. Dois destinos, mesma regra:
 * - **na tela**, `wttp-attachment://workspace/<caminho>` (protocolo do main, com `Range`);
 * - **no export**, o resolvedor devolve um `data:` (arquivo único) ou `null` (omitir).
 * A extensão decide: vídeo (`mp4`/`webm`) vira `<video controls>`, o resto continua `<img>`.
 * Todo atributo é escapado — o caminho vem de texto digitado pelo usuário.
 */

import { escapeHtml } from "./markdownVars";

export const ATTACHMENT_SCHEME_URL = "wttp-attachment://workspace/";

const ATTACHMENT_PATH = /^attachments\/[^/\\?#]+\.(png|jpe?g|gif|webp|svg|mp4|webm)$/i;
const VIDEO_PATH = /\.(mp4|webm)$/i;
const IMG_TAG = /<img\b[^>]*>/gi;

export function isAttachmentPath(src: string): boolean {
  return ATTACHMENT_PATH.test(src);
}

export function isVideoPath(path: string): boolean {
  return VIDEO_PATH.test(path);
}

/** Todos os caminhos de anexo citados em `![](attachments/...)` num texto markdown. */
export function attachmentPathsIn(markdown: string): string[] {
  const found = new Set<string>();
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(\s*(attachments\/[^)\s]+)/g)) {
    if (isAttachmentPath(match[1])) found.add(match[1]);
  }
  return [...found];
}

export function attachmentUrl(path: string): string {
  return ATTACHMENT_SCHEME_URL + path.split("/").map(encodeURIComponent).join("/");
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  return match ? match[1] : null;
}

/** HTML do `src` decodificado de entidades que o markdown-it escreve (`&amp;`), para comparar com o caminho. */
function unescapeSrc(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Reescreve os `<img>` que apontam para `attachments/`. `resolve` devolve a URL final
 * (`wttp-attachment:` na tela, `data:` no export) ou `null` para omitir o anexo.
 */
export function rewriteAttachmentsInHtml(
  html: string,
  resolve: (path: string) => string | null = attachmentUrl,
): string {
  if (!html.includes("attachments/")) return html;
  return html.replace(IMG_TAG, tag => {
    const src = attr(tag, "src");
    if (src === null) return tag;
    const path = unescapeSrc(src);
    if (!isAttachmentPath(path)) return tag;

    const alt = unescapeSrc(attr(tag, "alt") ?? "");
    const url = resolve(path);
    if (url === null) {
      return `<em data-attachment-omitted="${escapeHtml(path)}">${escapeHtml(alt || path)}</em>`;
    }
    const safeUrl = escapeHtml(url);
    if (isVideoPath(path)) {
      return `<video controls preload="metadata" src="${safeUrl}" title="${escapeHtml(alt)}" style="max-width:100%"></video>`;
    }
    return `<img src="${safeUrl}" alt="${escapeHtml(alt)}">`;
  });
}

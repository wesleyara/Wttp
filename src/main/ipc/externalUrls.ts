/**
 * URLs que `app:openExternal` (e os links da janela de documentação) podem abrir no
 * browser do SO (EP-08.1-T05/T07) — nunca confia no que o renderer manda sem checar.
 * Fica fora de `app.ts` para ser importável sem `electron` (testes, janela de docs).
 */
export const ALLOWED_EXTERNAL_URLS = [
  "https://github.com/wesleyara/Wttp",
  "https://github.com/wesleyara/Wttp/issues",
  "https://github.com/wesleyara/Wttp/tree/main/docs",
  // Site publicado da documentação (EP-08.1-T07, GitHub Pages).
  "https://wesleyara.github.io/Wttp",
];

export function isAllowedExternalUrl(url: string): boolean {
  return ALLOWED_EXTERNAL_URLS.some(allowed => url === allowed || url.startsWith(`${allowed}/`));
}

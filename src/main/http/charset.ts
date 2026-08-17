const DEFAULT_CHARSET = "utf-8";

/**
 * Extrai o charset do `Content-Type` da resposta. Sem parâmetro `charset`, assume
 * `utf-8` — nunca deixamos a ausência virar `undefined` e a UI decidir sozinha.
 */
export function detectCharset(contentType: string | undefined): string {
  if (!contentType) return DEFAULT_CHARSET;
  const match = /charset=([^;]+)/i.exec(contentType);
  if (!match) return DEFAULT_CHARSET;
  return match[1]
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
}

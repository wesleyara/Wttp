/**
 * Reformatação "pretty" do body da resposta (EP-03-T07). JSON é reserializado de
 * verdade; XML/HTML só ganham quebra de linha e indentação por profundidade de tag —
 * best-effort, nunca lança, então markup malformado ainda sai com alguma formatação em
 * vez de travar a aba.
 */

export interface PrettyPrintResult {
  text: string;
  /** Presente quando o parse falhou — a UI mostra isso como aviso, nunca como tela vazia. */
  warning?: string;
}

export function prettyPrintJson(raw: string): PrettyPrintResult {
  if (raw.trim() === "") return { text: raw };
  try {
    const parsed: unknown = JSON.parse(raw);
    return { text: JSON.stringify(parsed, null, 2) };
  } catch {
    return { text: raw, warning: "Invalid JSON — showing the raw response instead." };
  }
}

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export function prettyPrintMarkup(raw: string): PrettyPrintResult {
  if (raw.trim() === "") return { text: raw };

  const lines = raw.replace(/>\s*</g, ">\n<").trim().split("\n");

  let depth = 0;
  const out: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;

    const isClosing = /^<\//.test(line);
    const tagName = (/^<\/?([a-zA-Z0-9:-]+)/.exec(line)?.[1] ?? "").toLowerCase();
    const isSelfClosing = /\/>\s*$/.test(line) || VOID_TAGS.has(tagName);
    const isDeclaration = /^<[?!]/.test(line);
    const isOpenAndCloseSameLine = new RegExp(`^<${tagName}[^>]*>.*</${tagName}>$`, "i").test(line);

    if (isClosing) depth = Math.max(0, depth - 1);
    out.push("  ".repeat(depth) + line);
    if (!isClosing && !isSelfClosing && !isDeclaration && !isOpenAndCloseSameLine) depth++;
  }

  return { text: out.join("\n") };
}

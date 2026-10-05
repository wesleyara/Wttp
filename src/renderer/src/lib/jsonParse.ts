/**
 * Parse de JSON para a ferramenta avulsa de visualização (ClickLocal #163). Diferente
 * do `JSON.parse` cru, devolve o erro com linha/coluna — o V8 só dá `position` (ou, nas
 * versões novas, já a linha/coluna na própria mensagem).
 */
import type { Json } from "./jsonTree";

export type JsonParseResult =
  | { ok: true; data: Json }
  | { ok: false; message: string; line: number | null; column: number | null };

function lineColumnAt(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, Math.min(position, text.length));
  const lines = before.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

export function parseJsonDocument(text: string): JsonParseResult {
  try {
    return { ok: true, data: JSON.parse(text) as Json };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const direct = /line (\d+) column (\d+)/.exec(message);
    if (direct) {
      return { ok: false, message, line: Number(direct[1]), column: Number(direct[2]) };
    }
    const position = /position (\d+)/.exec(message);
    if (position) {
      const { line, column } = lineColumnAt(text, Number(position[1]));
      return { ok: false, message, line, column };
    }
    // Node mais novo: "Unexpected token 'X', ...\"contexto\" is not valid JSON" — sem posição,
    // então localiza o trecho de contexto no texto e procura o token dentro dele.
    const snippet = /Unexpected token '(.)', (\.\.\.)?"([\s\S]*?)"(\.\.\.)? is not valid JSON/.exec(
      message,
    );
    if (snippet) {
      const [, token, leading, context] = snippet;
      const start = text.indexOf(context);
      if (start >= 0) {
        // O V8 mostra ~10 caracteres antes do token quando corta o começo do texto.
        const tokenAt = context.indexOf(token, leading ? Math.min(10, context.length - 1) : 0);
        const { line, column } = lineColumnAt(text, start + Math.max(tokenAt, 0));
        return { ok: false, message, line, column };
      }
    }
    // Erro de "fim inesperado" não traz posição: aponta para o fim do texto.
    if (/end of JSON|Unexpected end/i.test(message)) {
      const { line, column } = lineColumnAt(text, text.length);
      return { ok: false, message, line, column };
    }
    return { ok: false, message, line: null, column: null };
  }
}

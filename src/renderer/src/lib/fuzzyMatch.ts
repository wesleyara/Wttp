/**
 * Busca rápida (EP-05-T06) — sem lib externa, um scan linear é sobra dentro do
 * orçamento de 50ms mesmo com 1000 requests (nenhum índice precisa ser mantido).
 * Prioriza, nessa ordem: substring no início do nome, substring em qualquer lugar do
 * nome, subsequence no nome; caminho/URL entram como um critério de alcançabilidade
 * de prioridade bem menor — dá pra achar uma request digitando parte da URL, só não
 * disputa o topo do ranking com um match de nome.
 */

export interface SearchableText {
  name: string;
  path: string;
  url: string;
}

/** Quão "junto" a query aparece em `target`, na ordem — `null` quando algum caractere falta. */
function subsequenceScore(query: string, target: string): number | null {
  let cursor = 0;
  let score = 0;

  for (const char of query) {
    const index = target.indexOf(char, cursor);
    if (index === -1) return null;
    score += index === cursor ? 2 : 1;
    cursor = index + 1;
  }

  return score;
}

/** `null` = não corresponde. Maior = melhor. */
export function scoreMatch(query: string, text: SearchableText): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const name = text.name.toLowerCase();
  if (name.startsWith(q)) return 1000 - name.length;

  const nameIndex = name.indexOf(q);
  if (nameIndex !== -1) return 500 - nameIndex;

  const nameSubsequence = subsequenceScore(q, name);
  if (nameSubsequence !== null) return 200 + nameSubsequence;

  const path = text.path.toLowerCase();
  const url = text.url.toLowerCase();
  if (path.includes(q) || url.includes(q)) return 50;

  const otherSubsequence = subsequenceScore(q, path) ?? subsequenceScore(q, url);
  if (otherSubsequence !== null) return 10 + otherSubsequence;

  return null;
}

const DEFAULT_LIMIT = 50;

/** Filtra e ordena `items` por relevância; `query` vazia devolve `[]` — sem lista "tudo" ruidosa. */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  getText: (item: T) => SearchableText,
  limit = DEFAULT_LIMIT,
): T[] {
  if (!query.trim()) return [];

  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = scoreMatch(query, getText(item));
    if (score !== null) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(entry => entry.item);
}

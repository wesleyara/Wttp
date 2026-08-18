import type { KeyValueEntry } from "@shared";

/**
 * Sincronização URL ↔ tabela de query params da `RequestUrlBar` (EP-03-T05). Funções
 * puras, sem Vue — `new URL()` exige uma URL absoluta e válida, mas `store.url` pode
 * conter `{{base_url}}/path?x=1`, que não é uma; por isso o parsing é manual, sobre a
 * primeira `?`, em vez de usar a API `URL`.
 */

/** Tudo antes da primeira `?` — a URL sem query string. */
export function urlBase(url: string): string {
  const index = url.indexOf("?");
  return index === -1 ? url : url.slice(0, index);
}

/**
 * Extrai a query string da URL e a transforma em linhas de tabela, todas habilitadas —
 * uma URL colada não carrega o conceito de linha desabilitada.
 */
export function parseQueryFromUrl(url: string): KeyValueEntry[] {
  const index = url.indexOf("?");
  if (index === -1) return [];
  const params = new URLSearchParams(url.slice(index + 1));
  return [...params.entries()].map(([name, value]) => ({
    name,
    value,
    enabled: true,
    description: "",
  }));
}

/** Canonicaliza para comparação — `description` some do YAML quando vazio (docs/file-format.md), mas `parseQueryFromUrl` sempre inclui `""`; sem isso a mesma query lida do disco e reparseada da URL comparam como diferentes. */
export function normalizeEntries(entries: KeyValueEntry[]): KeyValueEntry[] {
  return entries.map(entry => ({
    name: entry.name,
    value: entry.value,
    enabled: entry.enabled,
    description: entry.description ?? "",
  }));
}

/** `{{nome}}` sobrevive ao `URLSearchParams.toString()` — sem isso, `{{url}}` vira `%7B%7Burl%7D%7D` na URL, ilegível e não mais reconhecido como variável até o envio resolvê-la. */
const ENCODED_VARIABLE_PATTERN = /%7B%7B(.*?)%7D%7D/g;

function preserveVariableSyntax(encoded: string): string {
  return encoded.replace(
    ENCODED_VARIABLE_PATTERN,
    (_, inner: string) => `{{${decodeURIComponent(inner.replace(/\+/g, " "))}}}`,
  );
}

/**
 * Reescreve a URL com as linhas habilitadas da tabela. Linhas desabilitadas somem da
 * URL mas continuam na tabela — reescrever a URL nunca as remove de lá.
 */
export function rewriteUrlQuery(url: string, rows: KeyValueEntry[]): string {
  const base = urlBase(url);
  const enabled = rows.filter(row => row.enabled && row.name !== "");
  if (enabled.length === 0) return base;

  const params = new URLSearchParams();
  for (const row of enabled) params.append(row.name, row.value);
  return `${base}?${preserveVariableSyntax(params.toString())}`;
}

/**
 * `{{variável}}` na prévia de documentação (EP-12-T01): depois que o markdown vira HTML,
 * cada referência é trocada pelo valor do environment ativo (já mascarado quando a
 * variável é `secret`). Referência não resolvida fica visível, marcada, em vez de sumir.
 * Só toca em texto — nunca dentro de uma tag —, e todo valor é escapado, então um valor
 * de variável não consegue injetar HTML na prévia.
 */

const VARIABLE_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;

const RESOLVED_STYLE = "background:rgb(var(--w-accent) / 0.15);border-radius:3px;padding:0 3px;";
const UNRESOLVED_STYLE =
  "background:rgb(var(--w-status-3xx) / 0.18);border-radius:3px;padding:0 3px;";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Troca `{{nome}}` nos nós de texto de `html`; o que está dentro de `<...>` passa intacto. */
export function substituteVariablesInHtml(html: string, values: Record<string, string>): string {
  if (!html.includes("{{")) return html;
  return html
    .split(/(<[^>]*>)/)
    .map(part => {
      if (part.startsWith("<")) return part;
      return part.replace(VARIABLE_PATTERN, (match, name: string) => {
        if (Object.prototype.hasOwnProperty.call(values, name)) {
          return `<span style="${RESOLVED_STYLE}" title="${escapeHtml(name)}">${escapeHtml(values[name])}</span>`;
        }
        return `<span style="${UNRESOLVED_STYLE}" title="${escapeHtml(name)} — not resolved">${match}</span>`;
      });
    })
    .join("");
}

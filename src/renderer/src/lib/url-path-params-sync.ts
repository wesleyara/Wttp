import type { KeyValueEntry } from "@shared";

/**
 * Sincronização URL → tabela de path params (EP-06.1). Ao contrário da query string,
 * o valor de um path param não vive na URL (`:id` é só o nome do segmento) — por isso
 * a sincronização é de mão única e por reconciliação: nomes que somem da URL saem da
 * tabela, nomes novos entram em branco, e o valor de um nome que continua presente
 * nunca é tocado.
 */

const PATH_PARAM_PATTERN = /:([A-Za-z_][A-Za-z0-9_]*)/g;

/** Nomes de segmento `:nome`, na ordem em que aparecem na URL, sem repetição. */
export function parsePathParamNames(url: string): string[] {
  const names: string[] = [];
  for (const match of url.matchAll(PATH_PARAM_PATTERN)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

export function reconcilePathParams(names: string[], existing: KeyValueEntry[]): KeyValueEntry[] {
  return names.map(
    name =>
      existing.find(entry => entry.name === name) ?? {
        name,
        value: "",
        enabled: true,
        description: "",
      },
  );
}

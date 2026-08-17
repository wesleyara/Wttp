import type { Migration } from "./types";

/**
 * Migrador de exemplo, 1 → 2. Não está registrado em `MIGRATIONS` (`registry.ts`) — a
 * versão 2 do formato não existe. Existe só para documentar a forma esperada de um
 * migrador real quando o formato precisar mudar de verdade, e para ter cobertura de
 * teste do padrão. Ilustra uma renomeação de campo (`description` → `summary`).
 */
export const workspaceDescriptionToSummary: Migration = {
  from: 1,
  to: 2,
  migrate: raw => {
    const { description, ...rest } = raw;
    return description === undefined ? rest : { ...rest, summary: description };
  },
};

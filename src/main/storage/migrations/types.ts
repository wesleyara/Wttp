/**
 * Forma de um migrador de schema — docs/file-format.md §6, regra 1. Cada migrador sobe
 * exatamente uma versão (`from` → `from + 1`); `migrateToCurrent` (`registry.ts`)
 * encadeia quantos forem necessários para alcançar `CURRENT_SCHEMA_VERSION`.
 *
 * Opera sobre o objeto já parseado do YAML (antes de `splitKnownFields`), não sobre o
 * texto bruto — é o mesmo formato que `parser.ts` recebe da lib `yaml`.
 */
export interface Migration {
  from: number;
  to: number;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
}

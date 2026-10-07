/**
 * Migração do `*.flow.yaml` (arch-docs/file-format.md §10). O flow tem a própria linha de
 * versão — `FLOW_SCHEMA_VERSION` — porque nasceu depois dos demais arquivos e ganhou o
 * formato de grafo (#59) sem que request, pasta ou environment precisassem mudar.
 *
 * v1 (#57): `nodes` era uma lista linear de requests, e a ordem da lista era a ordem de
 * execução. v2 (#59): cada nó tem `type`, e a ordem vem das `edges`. O migrador 1 → 2 dá
 * `type: request` a todo nó e liga cada um ao seguinte — o mesmo caminho, sem perda.
 */

import { FLOW_SCHEMA_VERSION } from "@shared/flow";

import type { Migration } from "./types";

import { DomainError } from "../../ipc/errors";

export const FLOW_MIGRATIONS: Migration[] = [
  {
    from: 1,
    to: 2,
    migrate: raw => {
      const nodes = Array.isArray(raw.nodes) ? (raw.nodes as Record<string, unknown>[]) : [];
      const edges = nodes.slice(1).map((node, index) => ({
        from: nodes[index].id,
        to: node.id,
      }));
      return {
        ...raw,
        nodes: nodes.map(node => ({ ...node, type: "request" })),
        ...(edges.length > 0 ? { edges } : {}),
      };
    },
  },
];

export function flowUnsupportedVersionMessage(version: number): string {
  return (
    `este flow usa o formato versão ${version}, que não é suportado por esta versão do ` +
    `Wttp (suporta até a versão ${FLOW_SCHEMA_VERSION}) — atualize o Wttp para abrir este flow`
  );
}

/** Versão declarada no arquivo — `wttp` ausente vale 1, como nos demais arquivos. */
export function flowVersionOf(raw: Record<string, unknown>): number {
  const value = raw["wttp"];
  if (value === undefined) return 1;
  return typeof value === "number" ? value : Number.NaN;
}

export function migrateFlowToCurrent(raw: Record<string, unknown>): Record<string, unknown> {
  const from = flowVersionOf(raw);
  if (from > FLOW_SCHEMA_VERSION) {
    throw new DomainError("SCHEMA_VERSION_UNSUPPORTED", flowUnsupportedVersionMessage(from));
  }
  let doc = raw;
  let version = from;
  while (version < FLOW_SCHEMA_VERSION) {
    const migration = FLOW_MIGRATIONS.find(m => m.from === version);
    if (!migration) {
      throw new DomainError(
        "SCHEMA_VERSION_UNSUPPORTED",
        `nenhum migrador de flow da versão ${version} para a próxima`,
      );
    }
    doc = migration.migrate(doc);
    version = migration.to;
  }
  return { ...doc, wttp: FLOW_SCHEMA_VERSION };
}

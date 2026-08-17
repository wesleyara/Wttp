/**
 * Versão do schema e migração entre versões — docs/file-format.md §6, regra 1.
 *
 * `resolveSchemaVersion` decide qual versão um arquivo lido tem, tratando `wttp`
 * ausente como versão 1 com aviso (nunca um erro — quem valida decide o que fazer com
 * o aviso). `migrateToCurrent` encadeia os migradores registrados até
 * `CURRENT_SCHEMA_VERSION`; abrir uma versão maior que a suportada nunca tenta
 * adivinhar o formato, sempre recusa com mensagem clara.
 */

import type { Migration } from "./types";

import { DomainError } from "../../ipc/errors";

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Migradores registrados, um por transição `from` → `from + 1`. Vazio hoje: só existe
 * a versão 1 do formato. `001-to-2.example.ts` mostra a forma de um migrador (1 → 2)
 * sem estar registrado aqui — serve de referência para quando a versão 2 existir de
 * verdade, não para ser aplicado.
 */
export const MIGRATIONS: Migration[] = [];

export interface VersionResolution {
  version: number;
  /** Presente só quando `wttp` estava ausente no arquivo. */
  warning?: string;
}

/** `wttp` ausente é tratado como versão 1, com aviso — nunca como erro de schema. */
export function resolveSchemaVersion(raw: Record<string, unknown>): VersionResolution {
  const value = raw["wttp"];
  if (value === undefined) {
    return { version: 1, warning: '"wttp" ausente no arquivo — assumindo versão 1 do formato' };
  }
  return { version: typeof value === "number" ? value : Number.NaN };
}

export function unsupportedVersionMessage(version: number): string {
  return (
    `este arquivo usa o formato de workspace versão ${version}, que não é suportado por ` +
    `esta versão do Wttp (suporta até a versão ${CURRENT_SCHEMA_VERSION}) — atualize o Wttp ` +
    `para abrir este workspace`
  );
}

/**
 * Encadeia migradores registrados de `fromVersion` até `CURRENT_SCHEMA_VERSION`.
 * Versão maior que a suportada, ou sem migrador registrado para algum salto do
 * caminho, é sempre um erro explícito — nunca uma tentativa de adivinhar o formato.
 */
export function migrateToCurrent(
  raw: Record<string, unknown>,
  fromVersion: number,
): Record<string, unknown> {
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    throw new DomainError("SCHEMA_VERSION_UNSUPPORTED", unsupportedVersionMessage(fromVersion));
  }

  let doc = raw;
  let version = fromVersion;
  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS.find(m => m.from === version);
    if (!migration) {
      throw new DomainError(
        "SCHEMA_VERSION_UNSUPPORTED",
        `nenhum migrador registrado da versão ${version} para a próxima — não é possível ` +
          `atualizar este arquivo até a versão ${CURRENT_SCHEMA_VERSION}`,
      );
    }
    doc = migration.migrate(doc);
    version = migration.to;
  }
  return { ...doc, wttp: CURRENT_SCHEMA_VERSION };
}

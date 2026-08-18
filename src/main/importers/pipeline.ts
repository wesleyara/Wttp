/**
 * `parse → normalize → emit` (EP-08-T01). `detectImportFormat`/`runImport` recebem o
 * registro de importadores por parâmetro (default: o singleton de `registry.ts`) só
 * para permitir testar a infra com um `Importer` de mentira, sem tocar o registro real.
 */

import type { ImportFormat, ImportReport } from "@shared";

import type { Importer } from "./types";

import { DomainError } from "../ipc/errors";
import { osKeychainEncryption, type SecretEncryption } from "../secrets/encryption";
import { emitImport } from "./emit";
import { importers as defaultImporters } from "./registry";

export function detectImportFormat(
  content: string,
  filename?: string,
  registry: Importer[] = defaultImporters,
): ImportFormat | null {
  const match = registry.find(importer => importer.detect(content, filename));
  return match?.format ?? null;
}

export interface RunImportInput {
  format: ImportFormat;
  content: string;
  root: string;
  targetPath: string;
}

export async function runImport(
  input: RunImportInput,
  registry: Importer[] = defaultImporters,
  encryption: SecretEncryption = osKeychainEncryption,
): Promise<ImportReport> {
  const importer = registry.find(candidate => candidate.format === input.format);
  if (!importer) {
    throw new DomainError(
      "IMPORT_FORMAT_UNRECOGNIZED",
      `no importer registered for format "${input.format}"`,
      input.format,
    );
  }

  let parsed: unknown;
  try {
    parsed = importer.parse(input.content);
  } catch (error) {
    throw new DomainError(
      "IMPORT_FORMAT_UNRECOGNIZED",
      `content is not a valid ${input.format} document`,
      error instanceof Error ? error.message : undefined,
    );
  }

  const normalized = importer.normalize(parsed);
  return emitImport(input.root, input.targetPath, normalized, encryption);
}

/**
 * `parse → normalize → emit` (EP-08-T01). `detectImportFormat`/`runImport` recebem o
 * registro de importadores por parâmetro (default: o singleton de `registry.ts`) só
 * para permitir testar a infra com um `Importer` de mentira, sem tocar o registro real.
 */

import type { ImportConflictResolution, ImportFormat, ImportPreview, ImportReport } from "@shared";

import type { Importer, NormalizedImport, NormalizedNode } from "./types";

import { DomainError } from "../ipc/errors";
import { osKeychainEncryption, type SecretEncryption } from "../secrets/encryption";
import { emitImport, emitImportMerge } from "./emit";
import { importers as defaultImporters } from "./registry";

export function detectImportFormat(
  content: string,
  filename?: string,
  registry: Importer[] = defaultImporters,
): ImportFormat | null {
  const match = registry.find(importer => importer.detect(content, filename));
  return match?.format ?? null;
}

/** Compartilhado por `runImport`/`previewImport` — as duas fases anteriores a `emit`. */
function parseAndNormalize(
  format: ImportFormat,
  content: string,
  registry: Importer[],
): NormalizedImport {
  const importer = registry.find(candidate => candidate.format === format);
  if (!importer) {
    throw new DomainError(
      "IMPORT_FORMAT_UNRECOGNIZED",
      `no importer registered for format "${format}"`,
      format,
    );
  }

  let parsed: unknown;
  try {
    parsed = importer.parse(content);
  } catch (error) {
    throw new DomainError(
      "IMPORT_FORMAT_UNRECOGNIZED",
      `content is not a valid ${format} document`,
      error instanceof Error ? error.message : undefined,
    );
  }

  return importer.normalize(parsed);
}

export interface RunImportInput {
  format: ImportFormat;
  content: string;
  root: string;
  targetPath: string;
  /** Presente (mesmo vazio) → EP-08-T07: grava direto em `targetPath`, resolvendo conflito por item. Ausente → EP-08-T06: sempre workspace novo, envolvido numa pasta-raiz. */
  resolutions?: ImportConflictResolution[];
}

export async function runImport(
  input: RunImportInput,
  registry: Importer[] = defaultImporters,
  encryption: SecretEncryption = osKeychainEncryption,
): Promise<ImportReport> {
  const normalized = parseAndNormalize(input.format, input.content, registry);
  return input.resolutions
    ? emitImportMerge(input.root, input.targetPath, normalized, input.resolutions, encryption)
    : emitImport(input.root, input.targetPath, normalized, encryption);
}

export interface PreviewImportInput {
  format: ImportFormat;
  content: string;
}

function toPreviewNode(node: NormalizedNode): ImportPreview["children"][number] {
  if (node.kind === "folder") {
    return { kind: "folder", name: node.name, children: node.children.map(toPreviewNode) };
  }
  return { kind: "request", name: node.name, method: node.method };
}

/** `parse` + `normalize`, sem `emit` — nada é gravado em disco (EP-08-T06). */
export function previewImport(
  input: PreviewImportInput,
  registry: Importer[] = defaultImporters,
): ImportPreview {
  const normalized = parseAndNormalize(input.format, input.content, registry);
  return {
    name: normalized.name,
    children: normalized.children.map(toPreviewNode),
    environments: normalized.environments.map(environment => ({
      name: environment.name,
      variableCount: environment.variables.length,
    })),
    notConverted: normalized.notConverted,
  };
}

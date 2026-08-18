/**
 * Superfície pública de `importers/`. Módulos de formato (EP-08-T02..T05) importam
 * `registerImporter` daqui e se registram ao ser importados por este arquivo.
 */

export { detectImportFormat, runImport } from "./pipeline";
export type { RunImportInput } from "./pipeline";
export { registerImporter } from "./registry";
export type {
  Importer,
  NormalizedEnvironment,
  NormalizedFolder,
  NormalizedImport,
  NormalizedNode,
  NormalizedRequest,
} from "./types";

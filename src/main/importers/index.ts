/**
 * Superfície pública de `importers/`. Módulos de formato (EP-08-T02..T05) se
 * registram aqui — adicionar um formato novo é só uma linha em `registerImporter`,
 * nada no resto do pipeline muda.
 */

import { curlImporter } from "./curl";
import { postmanImporter } from "./postman";
import { registerImporter } from "./registry";

registerImporter(curlImporter);
registerImporter(postmanImporter);

export { looksLikeCurlCommand, parseCurlCommand, parseCurlToRequest } from "./curl";
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

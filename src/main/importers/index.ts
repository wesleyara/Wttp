/**
 * Superfície pública de `importers/`. Módulos de formato (EP-08-T02..T05) se
 * registram aqui — adicionar um formato novo é só uma linha em `registerImporter`,
 * nada no resto do pipeline muda.
 */

import { curlImporter } from "./curl";
import { insomniaImporter } from "./insomnia";
import { openapiImporter } from "./openapi";
import { postmanImporter } from "./postman";
import { registerImporter } from "./registry";

registerImporter(curlImporter);
registerImporter(postmanImporter);
registerImporter(insomniaImporter);
registerImporter(openapiImporter);

export { looksLikeCurlCommand, parseCurlCommand, parseCurlToRequest } from "./curl";
export { detectImportFormat, previewImport, runImport } from "./pipeline";
export type { PreviewImportInput, RunImportInput } from "./pipeline";
export { registerImporter } from "./registry";
export type {
  Importer,
  NormalizedEnvironment,
  NormalizedFolder,
  NormalizedImport,
  NormalizedNode,
  NormalizedRequest,
} from "./types";

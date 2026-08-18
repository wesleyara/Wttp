/**
 * Registro de importadores disponíveis. Cada módulo de formato (`postman.ts`,
 * `insomnia.ts`, ...) chama `registerImporter` uma vez, em `index.ts` — adicionar um
 * formato novo é só essa linha, nada aqui muda (EP-08-T01, critério de aceite 1).
 */

import type { Importer } from "./types";

export const importers: Importer[] = [];

export function registerImporter(importer: Importer): void {
  importers.push(importer);
}

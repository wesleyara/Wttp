/**
 * Escrita atômica de arquivo — docs/backlog EP-04-T04: interromper o app durante um
 * save nunca pode deixar um arquivo truncado. Grava num arquivo temporário no mesmo
 * diretório e troca com `rename`, que o filesystem garante ser atômico — o arquivo
 * final sempre tem o conteúdo antigo por completo ou o novo por completo, nunca algo
 * no meio.
 */

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";

export async function writeFileAtomic(path: string, contents: string): Promise<void> {
  const dir = dirname(path);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await fs.writeFile(tmpPath, contents, "utf-8");
  await fs.rename(tmpPath, path);
}

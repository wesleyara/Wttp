/**
 * Escrita atômica de arquivo — arch-docs/backlog EP-04-T04: interromper o app durante um
 * save nunca pode deixar um arquivo truncado. Grava num arquivo temporário no mesmo
 * diretório e troca com `rename`, que o filesystem garante ser atômico — o arquivo
 * final sempre tem o conteúdo antigo por completo ou o novo por completo, nunca algo
 * no meio.
 *
 * Chokepoint de toda escrita de conteúdo do storage (EP-04-T05): marca o caminho em
 * `writeTracker` para o watcher ignorar o próprio evento de fs e para `tree.ts`
 * detectar conflito num `writeNode` futuro.
 */

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";

import { markOwnWrite, recordKnownMtime } from "./writeTracker";

export async function writeFileAtomic(path: string, contents: string): Promise<void> {
  const dir = dirname(path);
  await fs.mkdir(dir, { recursive: true });

  // Marca antes de tocar o disco: o evento de fs do `rename` abaixo pode ser entregue
  // ao watcher em qualquer ponto depois daqui, inclusive antes do `await` seguinte
  // devolver o controle — marcar só depois do rename arriscaria perder a corrida.
  markOwnWrite(path);

  const tmpPath = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await fs.writeFile(tmpPath, contents, "utf-8");
  await fs.rename(tmpPath, path);

  const stat = await fs.stat(path);
  recordKnownMtime(path, stat.mtimeMs);
}

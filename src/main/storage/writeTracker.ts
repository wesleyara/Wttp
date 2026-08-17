/**
 * Estado efêmero em memória, por processo, sobre escritas feitas pelo próprio Wttp —
 * usado por dois consumidores do EP-04-T05:
 *
 * - `watcher.ts` consulta `isOwnWrite` para não reagir ao próprio save como se
 *   fosse edição externa (critério "save do próprio app não dispara reload em loop").
 * - `tree.ts` consulta `getKnownMtime` antes de `writeNode` para recusar sobrescrever
 *   um arquivo que mudou no disco desde a última leitura (critério "nada é perdido
 *   silenciosamente").
 *
 * Populado por `fsAtomic.writeFileAtomic` (chokepoint de toda escrita atômica) e por
 * `tree.ts` nos pontos que não passam por ali (`fs.rename` de `moveNode`, `fs.rm` de
 * `deleteNode`). Não sobrevive ao processo — não precisa, só serve para reconciliar o
 * que aconteceu durante a sessão atual do app.
 */

import { sep } from "node:path";

const OWN_WRITE_TTL_MS = 2000;

const ownWrites = new Map<string, number>();
const knownMtimes = new Map<string, number>();

/**
 * Marca `absPath` como escrito por este processo — janela curta para o watcher ver
 * todos os eventos de fs correspondentes (uma escrita costuma gerar mais de um: o
 * `rename` do arquivo temporário para o destino, às vezes reportado em duplicata pelo
 * watch recursivo). A marca fica disponível até expirar, não é consumida no primeiro
 * evento — se fosse, o segundo evento duplicado escaparia como se fosse externo.
 */
export function markOwnWrite(absPath: string): void {
  const now = Date.now();
  for (const [key, expiry] of ownWrites) {
    if (expiry < now) ownWrites.delete(key);
  }
  ownWrites.set(absPath, now + OWN_WRITE_TTL_MS);
}

/** `true` quando `absPath` foi escrito por este processo há pouco — watcher deve ignorar o evento de fs. */
export function isOwnWrite(absPath: string): boolean {
  const expiry = ownWrites.get(absPath);
  return expiry !== undefined && expiry >= Date.now();
}

/** Última `mtimeMs` conhecida de `absPath`, como vista por este processo (leitura ou escrita própria). */
export function getKnownMtime(absPath: string): number | undefined {
  return knownMtimes.get(absPath);
}

export function recordKnownMtime(absPath: string, mtimeMs: number): void {
  knownMtimes.set(absPath, mtimeMs);
}

/** Esquece `absPath` e tudo abaixo dele — chamado em delete/move, para não gerar falso conflito se o caminho for reusado. */
export function clearKnownMtimesUnder(absPath: string): void {
  const prefix = `${absPath}${sep}`;
  for (const key of knownMtimes.keys()) {
    if (key === absPath || key.startsWith(prefix)) knownMtimes.delete(key);
  }
}

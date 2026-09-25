/**
 * Quebra de linha dos arquivos YAML do workspace (card #64, arch-docs/file-format.md §6.2).
 * O serializer sempre produz LF; ao regravar um arquivo existente, a escrita converte
 * para a quebra de linha que o arquivo já tinha. Sem isso, num checkout do Windows com
 * `core.autocrlf=true` (working tree em CRLF) o primeiro save trocava todas as linhas em
 * disco, quebrando "salvar sem alterar nada produz bytes idênticos".
 *
 * A leitura não precisa de nada: o parser YAML normaliza CRLF, então os dados lidos de
 * um arquivo CRLF e do mesmo arquivo em LF são iguais.
 */

import { promises as fs } from "node:fs";

import { writeFileAtomic } from "./fsAtomic";

export type Eol = "\n" | "\r\n";

/** Quebra de linha de um texto, decidida pela primeira linha — o que editores e o Git fazem. Sem nenhuma quebra, LF. */
export function detectEol(text: string): Eol {
  const lf = text.indexOf("\n");
  return lf > 0 && text[lf - 1] === "\r" ? "\r\n" : "\n";
}

/** Converte um texto em LF (saída do serializer) para `eol`. */
export function applyEol(text: string, eol: Eol): string {
  return eol === "\n" ? text : text.replace(/\r?\n/g, "\r\n");
}

/** Quebra de linha do arquivo em `path`, ou LF quando ele não existe (arquivo novo). */
export async function readEol(path: string): Promise<Eol> {
  try {
    return detectEol(await fs.readFile(path, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "\n";
    throw error;
  }
}

/**
 * Grava YAML serializado (sempre LF) atomicamente, com a quebra de linha de `eolSource`
 * — por padrão o próprio `path` (regravar mantém a do arquivo; arquivo novo fica LF).
 * Duplicar passa o original como `eolSource`, para a cópia herdar a quebra de linha dele.
 */
export async function writeYamlAtomic(
  path: string,
  contents: string,
  eolSource: string = path,
): Promise<void> {
  await writeFileAtomic(path, applyEol(contents, await readEol(eolSource)));
}

/** `.gitignore` do workspace — arch-docs/file-format.md §1: criado ao inicializar, contendo `.wttp/`. */

import { promises as fs } from "node:fs";
import { join } from "node:path";

const IGNORED_ENTRY = ".wttp/";

export async function ensureGitignore(root: string): Promise<void> {
  const path = join(root, ".gitignore");

  let current = "";
  try {
    current = await fs.readFile(path, "utf-8");
  } catch {
    // ainda não existe — criado do zero abaixo
  }

  const alreadyIgnored = current.split("\n").some(line => line.trim() === IGNORED_ENTRY);
  if (alreadyIgnored) return;

  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  await fs.writeFile(path, `${current}${separator}${IGNORED_ENTRY}\n`, "utf-8");
}

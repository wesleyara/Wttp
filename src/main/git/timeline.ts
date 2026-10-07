/**
 * Timeline de um arquivo e restaurar versão (ClickLocal #55). Só leitura do Git — `git log
 * --follow` e `git show`; restaurar grava pelo storage, como uma edição comum, e nunca roda
 * um comando de escrita do Git: o resultado fica como mudança não commitada na aba Changes.
 */

import type { GitLog, GitLogEntry } from "@shared";

import { DomainError } from "../ipc/errors";
import { writeYamlAtomic } from "../storage/eol";
import { resolveWorkspacePath } from "../storage/paths";
import {
  assertSafeRef,
  getGitStatus,
  GitCommandError,
  kindOf,
  parseVersion,
  runGit,
  showAt,
} from "./git";

const MAX_ENTRIES = 200;
const HEADER = "\x01";

function statusOf(code: string): GitLogEntry["status"] {
  if (code.startsWith("R") || code.startsWith("C")) return "renamed";
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  return "modified";
}

/**
 * Saída de `git log --follow --name-status` com o cabeçalho de cada commit separado por
 * `\x01`: hash, hash curto, autor, data ISO e assunto separados por `\0`, e depois a linha
 * `<letra>\t<caminho>` (`R100\t<antes>\t<depois>` num rename).
 */
export function parseFileLog(output: string): GitLogEntry[] {
  const entries: GitLogEntry[] = [];
  for (const block of output.split(HEADER)) {
    if (!block.trim()) continue;
    const [header, ...rest] = block.split("\n");
    const [hash, shortHash, author, date, subject] = header.split("\0");
    const change = rest.find(line => line.includes("\t"));
    if (!hash || !change) continue;
    const [code, first, second] = change.split("\t");
    const renamed = statusOf(code) === "renamed";
    entries.push({
      hash,
      shortHash,
      author,
      date,
      subject,
      path: renamed ? second : first,
      ...(renamed ? { from: first } : {}),
      status: statusOf(code),
    });
  }
  return entries;
}

/** Commits que tocaram `path` (relativo ao workspace), do mais novo ao mais antigo, atravessando renomeações. */
export async function getFileLog(root: string, path: string): Promise<GitLog> {
  resolveWorkspacePath(root, path);
  const status = await getGitStatus(root);
  if (!status.available)
    return { available: false, inRepository: false, entries: [], truncated: false };
  if (!status.repository)
    return { available: true, inRepository: false, entries: [], truncated: false };

  let output: string;
  try {
    output = await runGit(root, [
      "-c",
      "core.quotepath=false",
      "log",
      "--follow",
      "--find-renames",
      "--relative",
      "--name-status",
      `--max-count=${MAX_ENTRIES + 1}`,
      `--format=${HEADER}%H%x00%h%x00%an%x00%aI%x00%s`,
      "--",
      path,
    ]);
  } catch (error) {
    // Repositório sem nenhum commit: não há história, e isso não é um erro.
    if (
      error instanceof GitCommandError &&
      /does not have any commits yet|bad default revision/i.test(error.stderr)
    ) {
      return { available: true, inRepository: true, entries: [], truncated: false };
    }
    throw new DomainError("GIT_FAILED", error instanceof Error ? error.message : "git log failed");
  }
  const entries = parseFileLog(output);
  return {
    available: true,
    inRepository: true,
    entries: entries.slice(0, MAX_ENTRIES),
    truncated: entries.length > MAX_ENTRIES,
  };
}

/**
 * Grava em `path` o conteúdo que o arquivo tinha em `ref`. O texto do commit vai como está
 * (bytes idênticos aos do commit), depois de passar pelo validador do tipo de arquivo — um
 * YAML que não parseia nunca sobrescreve o que está em disco.
 */
export async function restoreFileVersion(
  root: string,
  path: string,
  ref: string,
  from?: string,
): Promise<void> {
  assertSafeRef(ref);
  const absolute = resolveWorkspacePath(root, path);
  if (path === ".wttp" || path.startsWith(".wttp/")) {
    throw new DomainError("INVALID_PAYLOAD", ".wttp/ is local state and never goes to git", path);
  }
  const text = await showAt(root, ref, from ?? path);
  if (text === null) {
    throw new DomainError("ENOENT", `"${from ?? path}" does not exist in ${ref}`, path);
  }
  const version = parseVersion(kindOf(path), text);
  if (version.invalid) {
    throw new DomainError("INVALID_PAYLOAD", `the version in ${ref} is not valid Wttp YAML`, path);
  }
  await writeYamlAtomic(absolute, text);
}

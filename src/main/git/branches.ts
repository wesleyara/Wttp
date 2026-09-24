/**
 * Branches pelo StatusBar (ClickLocal #54): listar, trocar e criar. Sempre `git switch`
 * sem `--force` — se a troca conflita com mudanças locais, o próprio `git` recusa e a
 * mensagem dele chega à UI como está. O Wttp nunca força nada.
 */

import type { GitBranches } from "@shared";

import { DomainError } from "../ipc/errors";
import { assertSafeRef, getGitStatus, GitCommandError, listRefs, runGit } from "./git";

function failure(error: unknown, fallback: string): DomainError {
  if (error instanceof GitCommandError) {
    const text = error.stderr.trim() || error.message;
    return new DomainError("GIT_FAILED", text || fallback, text);
  }
  return new DomainError("GIT_FAILED", error instanceof Error ? error.message : fallback);
}

/** Máximo de caminhos de fora do workspace listados no aviso — a contagem vem inteira. */
const OUTSIDE_LIST_LIMIT = 20;

/**
 * Branches locais e remotas, mais o que o diálogo de troca precisa saber: a raiz do
 * repositório (a troca vale para ele inteiro, não só para o workspace) e as mudanças
 * pendentes **fora** do workspace, que também viajam (ou bloqueiam) no checkout.
 */
export async function getBranches(root: string): Promise<GitBranches> {
  const status = await getGitStatus(root);
  const repository = status.repository;
  if (!repository) throw new DomainError("INVALID_PAYLOAD", "not a git repository", root);

  const refs = (await listRefs(root)).filter(ref => ref.kind !== "tag");

  let outside: string[] = [];
  if (repository.workspacePath) {
    const output = await runGit(repository.root, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=normal",
    ]);
    const prefix = `${repository.workspacePath}/`;
    const tokens = output.split("\0");
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;
      const code = token.slice(0, 2);
      const path = token.slice(3);
      if (code[0] === "R" || code[0] === "C") i++; // o nome antigo vem no token seguinte
      if (!path.startsWith(prefix)) outside.push(path);
    }
  }
  const outsideCount = outside.length;
  outside = outside.slice(0, OUTSIDE_LIST_LIMIT);

  return { repository, refs, outsideChanges: outside, outsideChangesCount: outsideCount };
}

/**
 * Troca de branch. `track` = uma branch remota ("checkout as local"): cria a local de
 * mesmo nome acompanhando a remota. Nunca `--force`/`--discard-changes`.
 */
export async function checkoutBranch(root: string, name: string, track = false): Promise<void> {
  assertSafeRef(name);
  const status = await getGitStatus(root);
  if (!status.repository) throw new DomainError("INVALID_PAYLOAD", "not a git repository", root);
  try {
    await runGit(
      root,
      track ? ["switch", "--quiet", "--track", name] : ["switch", "--quiet", name],
    );
  } catch (error) {
    throw failure(error, "git switch failed");
  }
}

/** Cria uma branch a partir da atual e troca para ela. O nome passa pela regra do próprio git. */
export async function createBranch(root: string, name: string): Promise<void> {
  const status = await getGitStatus(root);
  if (!status.repository) throw new DomainError("INVALID_PAYLOAD", "not a git repository", root);
  if (typeof name !== "string" || name.startsWith("-")) {
    throw new DomainError("INVALID_PAYLOAD", `invalid branch name: "${name}"`);
  }
  try {
    await runGit(root, ["check-ref-format", "--branch", name]);
  } catch {
    throw new DomainError("INVALID_PAYLOAD", `invalid branch name: "${name}"`);
  }
  try {
    await runGit(root, ["switch", "--quiet", "--create", name]);
  } catch (error) {
    throw failure(error, "git switch --create failed");
  }
}

/**
 * Escritas Git da aba Changes (ClickLocal #53): stage, unstage, descartar, commit e
 * `git init`. Sempre limitadas ao workspace — todo comando recebe caminhos explícitos de
 * dentro dele (`--`), e o commit se recusa a sair se a index tiver algo de fora dele ou
 * de `.wttp/`. Hooks e config do usuário valem normalmente: é o `git` do sistema.
 */

import type { GitCommitResult } from "@shared";

import { promises as fs } from "node:fs";

import { DomainError } from "../ipc/errors";
import { ensureGitignore } from "../storage/gitignore";
import { resolveWorkspacePath } from "../storage/paths";
import { getGitStatus, GitCommandError, runGit } from "./git";

/** Caminhos vindos do renderer: relativos ao workspace, sem escapar dele, nunca vazios. */
function checkPaths(root: string, paths: string[]): string[] {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new DomainError("INVALID_PAYLOAD", "no paths given");
  }
  for (const path of paths) {
    if (typeof path !== "string" || path.length === 0) {
      throw new DomainError("INVALID_PAYLOAD", "invalid path");
    }
    resolveWorkspacePath(root, path);
    if (path === ".wttp" || path.startsWith(".wttp/")) {
      throw new DomainError("INVALID_PAYLOAD", ".wttp/ is local state and never goes to git", path);
    }
  }
  return paths;
}

async function requireRepository(
  root: string,
): Promise<NonNullable<Awaited<ReturnType<typeof getGitStatus>>["repository"]>> {
  const status = await getGitStatus(root);
  if (!status.repository) throw new DomainError("INVALID_PAYLOAD", "not a git repository", root);
  return status.repository;
}

/** Converte a falha do `git` numa mensagem que a UI mostra como está. */
function gitFailure(error: unknown, fallback: string): DomainError {
  if (error instanceof GitCommandError) {
    const text = error.stderr.trim() || error.message;
    if (
      /please tell me who you are|unable to auto-detect email address|empty ident name/i.test(text)
    ) {
      return new DomainError(
        "GIT_IDENTITY_MISSING",
        'git doesn\'t know who you are yet. Run git config --global user.name "Your Name" and git config --global user.email "you@example.com" in a terminal, then commit again.',
        text,
      );
    }
    return new DomainError("GIT_FAILED", text || fallback, text);
  }
  return new DomainError("GIT_FAILED", error instanceof Error ? error.message : fallback);
}

export async function stagePaths(root: string, paths: string[]): Promise<void> {
  await requireRepository(root);
  const list = checkPaths(root, paths);
  try {
    // `-A` também registra arquivo apagado; `--` garante que nenhum path vire opção.
    await runGit(root, ["add", "-A", "--", ...list]);
  } catch (error) {
    throw gitFailure(error, "git add failed");
  }
}

export async function unstagePaths(root: string, paths: string[]): Promise<void> {
  const repository = await requireRepository(root);
  const list = checkPaths(root, paths);
  try {
    // Sem nenhum commit ainda não há HEAD para onde voltar: só tira da index.
    if (repository.head === null) await runGit(root, ["rm", "--cached", "-r", "-q", "--", ...list]);
    else await runGit(root, ["restore", "--staged", "--", ...list]);
  } catch (error) {
    throw gitFailure(error, "git restore --staged failed");
  }
}

async function existsInHead(root: string, path: string): Promise<boolean> {
  return runGit(root, ["cat-file", "-e", `HEAD:./${path}`]).then(
    () => true,
    () => false,
  );
}

/**
 * Volta cada caminho ao que está no último commit — index e disco. O que não existe no
 * commit (untracked ou recém-adicionado) é apagado; um rename volta ao nome antigo.
 * Conflito de merge nunca é descartado por aqui: é coisa de resolver com calma no terminal.
 */
export async function discardPaths(root: string, paths: string[]): Promise<void> {
  const repository = await requireRepository(root);
  const list = checkPaths(root, paths);
  const status = await getGitStatus(root);
  const byPath = new Map(status.files.map(file => [file.path, file]));

  for (const path of list) {
    const change = byPath.get(path);
    if (!change) continue;
    if (change.status === "conflicted") {
      throw new DomainError(
        "GIT_FAILED",
        `"${path}" has a merge conflict — resolve it in a terminal`,
        path,
      );
    }
    try {
      if (change.status === "untracked") {
        await fs.rm(resolveWorkspacePath(root, path), { force: true });
        continue;
      }
      const inHead = repository.head !== null && (await existsInHead(root, path));
      if (inHead) {
        await runGit(root, ["restore", "--source=HEAD", "--staged", "--worktree", "--", path]);
      } else {
        await runGit(root, ["rm", "-f", "-q", "--", path]);
      }
      if (change.from && repository.head !== null && (await existsInHead(root, change.from))) {
        await runGit(root, [
          "restore",
          "--source=HEAD",
          "--staged",
          "--worktree",
          "--",
          change.from,
        ]);
      }
    } catch (error) {
      throw gitFailure(error, "discard failed");
    }
  }
}

/**
 * Commit da index. Antes, recusa se a index tiver qualquer coisa fora do workspace (o
 * repositório pode ser o da API inteira — isso é commit para o terminal) ou dentro de
 * `.wttp/` (segredo em texto e estado local). Hooks (`pre-commit`, `commit-msg`) rodam; se
 * um falhar, a saída dele vira a mensagem de erro e nada é commitado.
 */
export async function commitStaged(root: string, message: string): Promise<GitCommitResult> {
  const repository = await requireRepository(root);
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new DomainError("INVALID_PAYLOAD", "the commit message is empty");
  }

  // Sem `--relative` nem pathspec: a index inteira, com caminhos relativos à raiz do repo.
  const staged = (await runGit(repository.root, ["diff", "--cached", "--name-only", "-z"]))
    .split("\0")
    .filter(Boolean);
  if (staged.length === 0) throw new DomainError("INVALID_PAYLOAD", "nothing staged to commit");

  const prefix = repository.workspacePath ? `${repository.workspacePath}/` : "";
  const outside = staged.filter(path => !path.startsWith(prefix));
  if (outside.length > 0) {
    throw new DomainError(
      "GIT_OUTSIDE_WORKSPACE",
      "There are files staged outside this workspace — commit them from a terminal.",
      outside.slice(0, 10).join("\n"),
    );
  }
  const local = staged.filter(path => {
    const inWorkspace = path.slice(prefix.length);
    return inWorkspace === ".wttp" || inWorkspace.startsWith(".wttp/");
  });
  if (local.length > 0) {
    throw new DomainError(
      "GIT_OUTSIDE_WORKSPACE",
      ".wttp/ holds local state and secrets and must never be committed — unstage it first.",
      local.join("\n"),
    );
  }

  try {
    await runGit(root, ["commit", "--file=-", "--quiet"], message);
  } catch (error) {
    throw gitFailure(error, "git commit failed");
  }
  const hash = (await runGit(root, ["rev-parse", "--short", "HEAD"])).trim();
  return { hash };
}

/** `git init` na raiz do workspace, com o `.gitignore` de `.wttp/` garantido. */
export async function initRepository(root: string): Promise<void> {
  const status = await getGitStatus(root);
  if (!status.available)
    throw new DomainError("GIT_FAILED", "git isn't installed or isn't on the PATH");
  if (status.repository)
    throw new DomainError(
      "INVALID_PAYLOAD",
      "already inside a git repository",
      status.repository.root,
    );
  try {
    await runGit(root, ["init", "--quiet"]);
  } catch (error) {
    throw gitFailure(error, "git init failed");
  }
  await ensureGitignore(root);
}

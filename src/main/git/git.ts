/**
 * Git pela CLI do sistema (ClickLocal #51) — `execFile`, nunca shell, sempre com timeout.
 * Nada de `isomorphic-git`: as escritas dos cards seguintes (commit, checkout, pull/push)
 * precisam respeitar credential helper, hooks e config do usuário, e só o `git` de verdade
 * faz isso.
 *
 * Sem `git` no PATH ou fora de um repositório, nada lança: `available`/`repository` dizem o
 * que existe, e a UI esconde o que não se aplica.
 */

import type { GitFileChange, GitFileStatus, GitInfo, GitStatus } from "@shared";

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { relative, sep } from "node:path";

const GIT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly code: number | string | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "GitCommandError";
  }
}

/** Ambiente de toda chamada: nunca pede credencial no terminal, nunca pega o lock da index só para ler. */
function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    // Mensagens de erro em inglês e estáveis — elas chegam à UI como estão.
    LC_ALL: "C",
    LANG: "C",
  };
}

export function runGit(cwd: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      {
        cwd,
        env: gitEnv(),
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const code =
            (error as NodeJS.ErrnoException).code ?? (error as { code?: number }).code ?? null;
          reject(new GitCommandError(stderr.trim() || error.message, code, stderr));
          return;
        }
        resolve(stdout);
      },
    );
    if (input !== undefined) child.stdin?.end(input);
  });
}

let gitAvailable: Promise<boolean> | null = null;

/** Detectado uma vez por processo — instalar o git com o app aberto pede reiniciar, como qualquer app. */
export function isGitAvailable(): Promise<boolean> {
  gitAvailable ??= runGit(process.cwd(), ["--version"]).then(
    () => true,
    () => false,
  );
  return gitAvailable;
}

/** Só para testes: esquece a detecção feita. */
export function resetGitDetectionForTests(): void {
  gitAvailable = null;
}

/** `path.relative` com `/`, como os paths de nó da árvore. */
function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/** Raiz do repositório que contém `root`, ou `null` se não há repositório. */
async function repositoryRoot(root: string): Promise<string | null> {
  try {
    return (await runGit(root, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    return null;
  }
}

/**
 * `XY` do porcelain v2 → um status só, do ponto de vista de quem olha a árvore: apagado
 * vence (o arquivo não está mais lá), depois novo, depois alterado.
 */
function statusOf(xy: string): GitFileStatus {
  if (xy.includes("D")) return "deleted";
  if (xy.includes("A") || xy.includes("R") || xy.includes("C")) return "added";
  return "modified";
}

interface ParsedStatus {
  branch: string | null;
  detached: boolean;
  head: string | null;
  entries: {
    path: string;
    status: GitFileStatus;
    staged: boolean;
    unstaged: boolean;
    from?: string;
  }[];
}

/** Saída de `git status --porcelain=v2 --branch -z` — caminhos relativos à raiz do repositório. */
export function parsePorcelainV2(output: string): ParsedStatus {
  const tokens = output.split("\0");
  const parsed: ParsedStatus = { branch: null, detached: false, head: null, entries: [] };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token.startsWith("# branch.oid ")) {
      const oid = token.slice("# branch.oid ".length);
      parsed.head = oid === "(initial)" ? null : oid.slice(0, 7);
    } else if (token.startsWith("# branch.head ")) {
      const head = token.slice("# branch.head ".length);
      parsed.detached = head === "(detached)";
      parsed.branch = parsed.detached ? null : head;
    } else if (token.startsWith("1 ")) {
      // 1 XY sub mH mI mW hH hI path
      const fields = token.split(" ");
      const xy = fields[1];
      parsed.entries.push({
        path: fields.slice(8).join(" "),
        status: statusOf(xy),
        staged: xy[0] !== ".",
        unstaged: xy[1] !== ".",
      });
    } else if (token.startsWith("2 ")) {
      // 2 XY sub mH mI mW hH hI Xscore path \0 origPath
      const fields = token.split(" ");
      const xy = fields[1];
      const from = tokens[++i];
      parsed.entries.push({
        path: fields.slice(9).join(" "),
        status: statusOf(xy),
        staged: xy[0] !== ".",
        unstaged: xy[1] !== ".",
        from,
      });
    } else if (token.startsWith("u ")) {
      // u XY sub m1 m2 m3 mW h1 h2 h3 path
      parsed.entries.push({
        path: token.split(" ").slice(10).join(" "),
        status: "conflicted",
        staged: true,
        unstaged: true,
      });
    } else if (token.startsWith("? ")) {
      parsed.entries.push({
        path: token.slice(2),
        status: "untracked",
        staged: false,
        unstaged: true,
      });
    }
  }
  return parsed;
}

async function realpathOrSame(path: string): Promise<string> {
  return fs.realpath(path).catch(() => path);
}

/**
 * Estado Git do workspace em `root`: repositório, branch e as mudanças **só dentro do
 * workspace** (`-- .` com `cwd` na raiz dele), já com caminhos relativos ao workspace.
 */
export async function getGitStatus(root: string): Promise<GitStatus> {
  if (!(await isGitAvailable())) return { available: false, repository: null, files: [] };

  const repoRoot = await repositoryRoot(root);
  if (!repoRoot) return { available: true, repository: null, files: [] };

  const output = await runGit(root, [
    "status",
    "--porcelain=v2",
    "--branch",
    "-z",
    "--untracked-files=all",
    "--",
    ".",
  ]);
  const parsed = parsePorcelainV2(output);

  // `--show-toplevel` já vem com o caminho real (symlinks resolvidos, ex. /tmp → /private/tmp
  // no macOS) — a raiz do workspace precisa do mesmo tratamento para o `relative` bater.
  const workspacePath = toPosix(
    relative(await realpathOrSame(repoRoot), await realpathOrSame(root)),
  );
  const prefix = workspacePath ? `${workspacePath}/` : "";
  const inWorkspace = (path: string): string | null =>
    path.startsWith(prefix) ? path.slice(prefix.length) : null;

  const files: GitFileChange[] = [];
  for (const entry of parsed.entries) {
    const path = inWorkspace(entry.path);
    // `.wttp/` já é gitignored (`ensureGitignore`); a checagem aqui cobre um workspace
    // antigo sem a regra — segredo em texto e estado local nunca aparecem como mudança.
    if (path === null || path === ".wttp" || path.startsWith(".wttp/")) continue;
    const from = entry.from ? inWorkspace(entry.from) : null;
    files.push({
      path,
      status: entry.status,
      staged: entry.staged,
      unstaged: entry.unstaged,
      ...(from ? { from } : {}),
    });
  }

  return {
    available: true,
    repository: {
      root: repoRoot,
      workspacePath,
      branch: parsed.branch,
      detached: parsed.detached,
      head: parsed.head,
    },
    files,
  };
}

export async function getGitInfo(root: string): Promise<GitInfo> {
  const { available, repository } = await getGitStatus(root);
  return { available, repository };
}

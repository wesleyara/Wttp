/**
 * Git pela CLI do sistema (ClickLocal #51) — `execFile`, nunca shell, sempre com timeout.
 * Nada de `isomorphic-git`: as escritas dos cards seguintes (commit, checkout, pull/push)
 * precisam respeitar credential helper, hooks e config do usuário, e só o `git` de verdade
 * faz isso.
 *
 * Sem `git` no PATH ou fora de um repositório, nada lança: `available`/`repository` dizem o
 * que existe, e a UI esconde o que não se aplica.
 */

import type {
  GitFileChange,
  GitFileKind,
  GitFileStatus,
  GitFileVersion,
  GitFileVersions,
  GitInfo,
  GitRef,
  GitStatus,
} from "@shared";

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { relative, sep } from "node:path";

import { DomainError } from "../ipc/errors";
import { resolveWorkspacePath } from "../storage/paths";
import {
  validateEnvironment,
  validateFolder,
  validateRequest,
  validateWorkspace,
} from "../storage/validate";

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

// --- Aba Changes (ClickLocal #52) -----------------------------------------------------------

/**
 * Uma ref que vira argumento do `git` — nunca começa com `-` (seria lida como opção) nem
 * tem espaço ou caractere de controle. O resto (`main`, `origin/x`, `v1.2`, `HEAD~3`,
 * `a1b2c3d`) passa.
 */
export function assertSafeRef(ref: string): void {
  if (!/^[A-Za-z0-9_][A-Za-z0-9._/@{}~^+-]*$/.test(ref) || ref.includes("..")) {
    throw new DomainError("INVALID_PAYLOAD", `invalid git ref: "${ref}"`);
  }
}

/** Branches locais, remotas e tags — as bases possíveis do "Compare with…". */
export async function listRefs(root: string): Promise<GitRef[]> {
  const output = await runGit(root, [
    "for-each-ref",
    "--format=%(refname)%00%(refname:short)%00%(HEAD)",
    "refs/heads",
    "refs/remotes",
    "refs/tags",
  ]);
  const refs: GitRef[] = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    const [full, short, head] = line.split("\0");
    if (full.endsWith("/HEAD")) continue; // `origin/HEAD` é só um apelido
    const kind: GitRef["kind"] = full.startsWith("refs/heads/")
      ? "branch"
      : full.startsWith("refs/remotes/")
        ? "remote"
        : "tag";
    refs.push({ name: short, kind, ...(head === "*" ? { current: true } : {}) });
  }
  return refs;
}

/** `--name-status -z` → mudanças; com `--relative`, caminhos já relativos ao workspace. */
function parseNameStatus(output: string): GitFileChange[] {
  const tokens = output.split("\0");
  const changes: GitFileChange[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i];
    if (!code) continue;
    const letter = code[0];
    if (letter === "R" || letter === "C") {
      const from = tokens[++i];
      const path = tokens[++i];
      changes.push({ path, from, status: "added", staged: false, unstaged: true });
    } else {
      const path = tokens[++i];
      const status: GitFileStatus =
        letter === "A"
          ? "added"
          : letter === "D"
            ? "deleted"
            : letter === "U"
              ? "conflicted"
              : "modified";
      changes.push({ path, status, staged: false, unstaged: true });
    }
  }
  return changes;
}

/**
 * Mudanças do workspace em relação a `base`. Com `HEAD` é o `git status` do #51; com outra
 * branch/tag/commit é `git diff <base>` do working tree (sem checkout nenhum), mais os
 * arquivos untracked, que o diff não vê.
 */
export async function getChanges(root: string, base = "HEAD"): Promise<GitFileChange[]> {
  const status = await getGitStatus(root);
  if (!status.repository) return [];
  if (base === "HEAD") return status.files;
  assertSafeRef(base);
  const output = await runGit(root, [
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    "--relative",
    base,
    "--",
    ".",
  ]);
  const changes = parseNameStatus(output).filter(
    change => change.path !== ".wttp" && !change.path.startsWith(".wttp/"),
  );
  const tracked = new Set(changes.map(change => change.path));
  for (const file of status.files) {
    if (file.status === "untracked" && !tracked.has(file.path)) changes.push(file);
  }
  return changes;
}

export function kindOf(path: string): GitFileKind {
  if (path.endsWith(".req.yaml")) return "request";
  if (path === "folder.yaml" || path.endsWith("/folder.yaml")) return "folder";
  if (path.startsWith("environments/") && /\.ya?ml$/.test(path)) return "environment";
  if (path === "wttp.yaml") return "workspace";
  return "text";
}

export function parseVersion(kind: GitFileKind, text: string): GitFileVersion {
  const validate =
    kind === "request"
      ? validateRequest
      : kind === "folder"
        ? validateFolder
        : kind === "environment"
          ? validateEnvironment
          : kind === "workspace"
            ? validateWorkspace
            : null;
  if (!validate) return { text };
  try {
    const result = validate(text);
    return result.valid ? { text, data: result.value } : { text, invalid: true };
  } catch {
    return { text, invalid: true };
  }
}

/** Conteúdo de `path` (relativo ao workspace) em `ref` — `null` se ele não existe lá. */
export async function showAt(root: string, ref: string, path: string): Promise<string | null> {
  try {
    // `<ref>:./<path>` resolve relativo ao `cwd` (a raiz do workspace), mesmo com o
    // workspace numa subpasta do repositório.
    return await runGit(root, ["show", `${ref}:./${path}`]);
  } catch (error) {
    if (
      error instanceof GitCommandError &&
      /does not exist|exists on disk, but not in|bad revision|invalid object name|unknown revision/i.test(
        error.stderr,
      )
    ) {
      return null;
    }
    throw error;
  }
}

/** Os dois lados de um arquivo para o diff campo a campo: na base e no disco. */
export async function getFileVersions(
  root: string,
  path: string,
  base = "HEAD",
  from?: string,
  ref?: string,
): Promise<GitFileVersions> {
  if (base !== "HEAD") assertSafeRef(base);
  if (ref) assertSafeRef(ref);
  // Mesmo guarda de `node:*`: nada fora da raiz do workspace.
  const absolute = resolveWorkspacePath(root, path);
  if (from) resolveWorkspacePath(root, from);
  const kind = kindOf(path);

  const beforeText = await showAt(root, base, from ?? path);
  // Com `ref`, o lado "depois" também vem de um commit (timeline, #55), não do disco.
  const afterText = ref
    ? await showAt(root, ref, path)
    : await fs.readFile(absolute, "utf-8").catch(() => null);

  return {
    kind,
    before: beforeText === null ? null : parseVersion(kind, beforeText),
    after: afterText === null ? null : parseVersion(kind, afterText),
  };
}

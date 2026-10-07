/**
 * Pull/push (ClickLocal #56) pela CLI `git` do sistema. Regras que não se negociam:
 *
 * - **Credenciais**: só o credential helper / ssh-agent do usuário. `GIT_TERMINAL_PROMPT=0`,
 *   `GIT_ASKPASS` vazio, `ssh -o BatchMode=yes` — nada pergunta nem guarda senha, e qualquer
 *   `user:senha@` que apareça numa mensagem de erro é mascarado antes de sair daqui.
 * - **Pull** é sempre `--ff-only`. Divergiu → `GIT_DIVERGED` e o disco fica exatamente como estava.
 * - **Push** nunca leva `--force`. Rejeitado → `GIT_PUSH_REJECTED`.
 * - Toda operação de rede tem timeout e pode ser cancelada (`git:cancel`).
 */

import type { GitAheadBehind } from "@shared";

import { execFile } from "node:child_process";

import { DomainError } from "../ipc/errors";
import { assertSafeRef, getGitStatus, GitCommandError, isGitAvailable, runGit } from "./git";

const NETWORK_TIMEOUT_MS = 60_000;

/** Operações de rede em andamento, por id — alvo do `git:cancel`. */
const operations = new Map<string, AbortController>();

/** `https://user:token@host` → `https://***@host`; nunca deixa credencial chegar a log/toast/erro. */
export function redactCredentials(text: string): string {
  return text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1***@");
}

function networkEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    SSH_ASKPASS: "",
    GCM_INTERACTIVE: "never",
    LC_ALL: "C",
    LANG: "C",
  };
  // Respeita um `GIT_SSH_COMMAND` do usuário; sem ele, ssh nunca pergunta senha/passphrase.
  env.GIT_SSH_COMMAND ||= "ssh -o BatchMode=yes";
  return env;
}

function runNetworkGit(cwd: string, args: string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        env: networkEnv(),
        timeout: NETWORK_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        signal,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        const clean = redactCredentials(stderr.trim() || error.message);
        const named = error as NodeJS.ErrnoException & { killed?: boolean };
        if (signal.aborted || named.name === "AbortError") {
          reject(new DomainError("CANCELLED", "cancelled"));
        } else if (named.killed) {
          reject(new DomainError("TIMEOUT", "git didn't answer in time — check the connection"));
        } else {
          reject(new GitCommandError(clean, named.code ?? null, redactCredentials(stderr)));
        }
      },
    );
  });
}

const AUTH_FAILURE =
  /authentication failed|could not read (username|password)|terminal prompts disabled|permission denied \(publickey|host key verification failed|invalid credentials|access denied|403|401/i;

/** Falha de `git` → `DomainError` com mensagem já sem credenciais; auth tem código e dica próprios. */
function remoteFailure(error: unknown, fallback: string): DomainError {
  if (error instanceof DomainError) return error;
  if (error instanceof GitCommandError) {
    const text = redactCredentials(error.stderr.trim() || error.message) || fallback;
    if (AUTH_FAILURE.test(text)) {
      return new DomainError(
        "GIT_AUTH_FAILED",
        "git couldn't authenticate with the remote. Wttp never asks for credentials — set up your system's git credential helper or ssh-agent, then try again.",
        text,
      );
    }
    return new DomainError("GIT_FAILED", text, text);
  }
  return new DomainError("GIT_FAILED", error instanceof Error ? error.message : fallback);
}

async function requireRepository(root: string): Promise<{ root: string; branch: string | null }> {
  if (!(await isGitAvailable())) {
    throw new DomainError("GIT_FAILED", "git isn't installed or isn't on the PATH");
  }
  const status = await getGitStatus(root);
  if (!status.repository) throw new DomainError("INVALID_PAYLOAD", "not a git repository", root);
  return { root, branch: status.repository.branch };
}

/** Roda `action` com um `AbortController` registrado sob `operationId` até terminar. */
async function withOperation<T>(
  operationId: string | undefined,
  action: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  if (operationId) operations.set(operationId, controller);
  try {
    return await action(controller.signal);
  } finally {
    if (operationId) operations.delete(operationId);
  }
}

export function cancelOperation(operationId: string): void {
  operations.get(operationId)?.abort();
}

/** ahead/behind da branch atual contra o upstream, só leitura local. */
export async function getAheadBehind(root: string): Promise<GitAheadBehind> {
  const { branch } = await requireRepository(root);
  const remotes = (await runGit(root, ["remote"])).split("\n").filter(Boolean);
  const hasRemote = remotes.length > 0;
  if (!branch) return { upstream: null, ahead: 0, behind: 0, hasRemote };

  let upstream: string;
  try {
    upstream = (await runGit(root, ["rev-parse", "--abbrev-ref", "@{upstream}"])).trim();
  } catch {
    return { upstream: null, ahead: 0, behind: 0, hasRemote };
  }
  try {
    const counts = await runGit(root, [
      "rev-list",
      "--left-right",
      "--count",
      "HEAD...@{upstream}",
    ]);
    const [ahead, behind] = counts.trim().split(/\s+/).map(Number);
    return { upstream, ahead: ahead || 0, behind: behind || 0, hasRemote };
  } catch {
    // Upstream configurado mas a ref remota não existe mais (branch apagada no remoto).
    return { upstream: null, ahead: 0, behind: 0, hasRemote };
  }
}

export async function fetchRemote(root: string, operationId?: string): Promise<GitAheadBehind> {
  await requireRepository(root);
  try {
    await withOperation(operationId, signal =>
      runNetworkGit(root, ["fetch", "--quiet", "--prune"], signal),
    );
  } catch (error) {
    throw remoteFailure(error, "git fetch failed");
  }
  return getAheadBehind(root);
}

export async function pullFastForward(root: string, operationId?: string): Promise<GitAheadBehind> {
  const { branch } = await requireRepository(root);
  if (!branch)
    throw new DomainError("INVALID_PAYLOAD", "HEAD is detached — switch to a branch first");
  try {
    await withOperation(operationId, async signal => {
      await runNetworkGit(root, ["fetch", "--quiet", "--prune"], signal);
      const state = await getAheadBehind(root);
      if (!state.upstream) {
        throw new DomainError("GIT_NO_UPSTREAM", `"${branch}" has no upstream branch to pull from`);
      }
      if (state.ahead > 0 && state.behind > 0) {
        throw new DomainError(
          "GIT_DIVERGED",
          "This branch has diverged from the remote. Nothing was changed — resolve it in the terminal.",
          state.upstream,
        );
      }
      if (state.behind === 0) return;
      // Local, sem rede: o fetch acima já trouxe tudo. `--ff-only` recusa qualquer merge.
      await runGit(root, ["merge", "--ff-only", "--quiet", "@{upstream}"]);
    });
  } catch (error) {
    throw remoteFailure(error, "git pull failed");
  }
  return getAheadBehind(root);
}

const PUSH_REJECTED = /rejected|non-fast-forward|fetch first|failed to push some refs/i;

export async function pushBranch(
  root: string,
  setUpstream = false,
  operationId?: string,
): Promise<GitAheadBehind> {
  const { branch } = await requireRepository(root);
  if (!branch)
    throw new DomainError("INVALID_PAYLOAD", "HEAD is detached — switch to a branch first");
  const state = await getAheadBehind(root);
  if (!state.hasRemote)
    throw new DomainError("GIT_FAILED", "this repository has no remote to push to");

  let args: string[];
  if (state.upstream) {
    args = ["push"];
  } else if (setUpstream) {
    assertSafeRef(branch);
    // `origin` é o único remote tratado pela UI (múltiplos remotes estão fora de escopo).
    args = ["push", "--set-upstream", "origin", branch];
  } else {
    throw new DomainError("GIT_NO_UPSTREAM", `"${branch}" has no upstream branch yet`);
  }

  try {
    await withOperation(operationId, signal => runNetworkGit(root, args, signal));
  } catch (error) {
    const failure = remoteFailure(error, "git push failed");
    if (failure.code === "GIT_FAILED" && PUSH_REJECTED.test(failure.message)) {
      throw new DomainError(
        "GIT_PUSH_REJECTED",
        "The remote has commits you don't have. Pull first (or resolve it in the terminal) — Wttp never force-pushes.",
        failure.message,
      );
    }
    throw failure;
  }
  return getAheadBehind(root);
}

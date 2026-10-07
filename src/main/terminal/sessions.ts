/**
 * Sessões de terminal embutido (ClickLocal #169): um pseudo-terminal real (`node-pty`)
 * por aba do painel, no diretório do workspace. O módulo não conhece Electron — quem
 * registra o IPC (`ipc/terminal.ts`) liga `onData`/`onExit` ao `webContents` dono da
 * sessão; assim `resolveShell` e o ciclo de vida ficam testáveis sem janela.
 */

import type { IPty } from "node-pty";

import { promises as fs } from "node:fs";

export interface SpawnOptions {
  cwd: string;
  cols: number;
  rows: number;
  /** Shell configurado em `AppSettings.terminalShell`; vazio = o do SO. */
  shell?: string;
}

export interface SessionHandlers {
  onData: (id: number, data: string) => void;
  onExit: (id: number, exitCode: number) => void;
}

export interface Shell {
  file: string;
  args: string[];
}

export class TerminalSessionError extends Error {}

/** Shell padrão do SO (ou o configurado), com `-l` no macOS para herdar o PATH do login. */
export function resolveShell(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  custom?: string,
): Shell {
  const configured = custom?.trim();
  if (configured) return { file: configured, args: [] };
  if (platform === "win32") return { file: env.COMSPEC || "powershell.exe", args: [] };
  if (platform === "darwin") return { file: env.SHELL || "/bin/zsh", args: ["-l"] };
  return { file: env.SHELL || "/bin/bash", args: [] };
}

/** Nome para a aba: `/usr/bin/zsh` → `zsh`, `C:\\Windows\\System32\\cmd.exe` → `cmd`. */
export function shellName(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? file;
  return base.replace(/\.exe$/i, "") || file;
}

function clampSize(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 && value < 1000 ? value : fallback;
}

/** Ambiente da sessão: o do app, sem variáveis do Electron que vazariam para o shell do usuário. */
function sessionEnv(base: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE") env[key] = value;
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  return env;
}

interface Entry {
  pty: IPty;
  owner: unknown;
}

const sessions = new Map<number, Entry>();
let nextId = 1;

export async function spawnSession(
  options: SpawnOptions,
  owner: unknown,
  handlers: SessionHandlers,
): Promise<{ id: number; shell: string }> {
  const stat = await fs.stat(options.cwd).catch(() => null);
  if (!stat?.isDirectory()) throw new TerminalSessionError(`"${options.cwd}" is not a folder.`);

  const shell = resolveShell(process.platform, process.env, options.shell);
  // Import tardio: o módulo nativo só carrega quando alguém abre um terminal — um app
  // sem o binário certo (ex.: build faltando) continua abrindo normalmente.
  const { spawn } = await import("node-pty");
  let pty: IPty;
  try {
    pty = spawn(shell.file, shell.args, {
      name: "xterm-256color",
      cwd: options.cwd,
      cols: clampSize(options.cols, 80),
      rows: clampSize(options.rows, 24),
      env: sessionEnv(process.env),
    });
  } catch (error) {
    throw new TerminalSessionError(
      `Could not start "${shell.file}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const id = nextId++;
  sessions.set(id, { pty, owner });
  pty.onData(data => handlers.onData(id, data));
  pty.onExit(({ exitCode }) => {
    sessions.delete(id);
    handlers.onExit(id, exitCode);
  });
  return { id, shell: shellName(shell.file) };
}

function entryFor(id: number, owner: unknown): Entry {
  const entry = sessions.get(id);
  // Uma janela nunca mexe na sessão de outra.
  if (!entry || entry.owner !== owner) throw new TerminalSessionError(`No terminal session ${id}.`);
  return entry;
}

export function writeSession(id: number, owner: unknown, data: string): void {
  entryFor(id, owner).pty.write(data);
}

export function resizeSession(id: number, owner: unknown, cols: number, rows: number): void {
  entryFor(id, owner).pty.resize(clampSize(cols, 80), clampSize(rows, 24));
}

export function killSession(id: number, owner: unknown): void {
  const entry = sessions.get(id);
  if (!entry || entry.owner !== owner) return;
  sessions.delete(id);
  entry.pty.kill();
}

/** Mata as sessões de uma janela (ou todas, sem `owner`) — chamado ao fechar janela/app. */
export function killSessions(owner?: unknown): void {
  for (const [id, entry] of [...sessions]) {
    if (owner !== undefined && entry.owner !== owner) continue;
    sessions.delete(id);
    entry.pty.kill();
  }
}

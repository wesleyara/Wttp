/**
 * Abre o terminal do sistema na raiz do workspace (ClickLocal #35 / EP-16). O Wttp não
 * embute terminal nem cliente de shell: só descobre qual terminal o SO tem e o lança,
 * destacado, com o diretório de trabalho certo. Puro e sem Electron — a lista de
 * candidatos é montada por `buildTerminalLaunch`, que recebe `exists` injetado para os
 * testes não dependerem do que está instalado na máquina.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { delimiter, join } from "node:path";

export interface TerminalLaunch {
  command: string;
  args: string[];
}

export class TerminalUnavailableError extends Error {}

/** Terminais do Linux em ordem de preferência, com a flag de diretório de cada um. */
const LINUX_TERMINALS: { command: string; cwdArgs: (cwd: string) => string[] }[] = [
  { command: "x-terminal-emulator", cwdArgs: () => [] },
  { command: "gnome-terminal", cwdArgs: cwd => [`--working-directory=${cwd}`] },
  { command: "konsole", cwdArgs: cwd => ["--workdir", cwd] },
  { command: "xfce4-terminal", cwdArgs: cwd => [`--working-directory=${cwd}`] },
  { command: "kitty", cwdArgs: cwd => ["--directory", cwd] },
  { command: "alacritty", cwdArgs: cwd => ["--working-directory", cwd] },
  { command: "xterm", cwdArgs: () => [] },
];

/**
 * Divide a linha de comando do usuário em argumentos, respeitando aspas simples e
 * duplas. Sem shell: `;`, `&&` e `$()` viram texto literal, nunca executam nada.
 */
export function splitCommandLine(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const char of line) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started || current) parts.push(current);
      current = "";
      started = false;
    } else {
      current += char;
    }
  }
  if (started || current) parts.push(current);
  return parts;
}

/**
 * Terminal customizado: `{cwd}` em qualquer argumento vira a raiz do workspace; sem
 * `{cwd}`, o processo só herda o diretório (a maioria dos terminais abre nele).
 */
function customLaunch(custom: string, cwd: string): TerminalLaunch {
  const [command, ...args] = splitCommandLine(custom);
  if (!command) throw new TerminalUnavailableError("The terminal command is empty.");
  return { command, args: args.map(arg => arg.split("{cwd}").join(cwd)) };
}

export async function buildTerminalLaunch(options: {
  platform: NodeJS.Platform;
  cwd: string;
  custom?: string;
  env?: Record<string, string | undefined>;
  exists: (command: string) => Promise<boolean>;
}): Promise<TerminalLaunch> {
  const { platform, cwd, exists } = options;
  const custom = options.custom?.trim();
  if (custom) return customLaunch(custom, cwd);

  if (platform === "darwin") return { command: "open", args: ["-a", "Terminal", cwd] };
  // `start` abre uma janela nova de console herdando o diretório do processo.
  if (platform === "win32") return { command: "cmd.exe", args: ["/c", "start", '""', "cmd.exe"] };

  const fromEnv = options.env?.TERMINAL?.trim();
  if (fromEnv && (await exists(splitCommandLine(fromEnv)[0] ?? ""))) {
    return customLaunch(fromEnv, cwd);
  }
  for (const terminal of LINUX_TERMINALS) {
    if (await exists(terminal.command)) {
      return { command: terminal.command, args: terminal.cwdArgs(cwd) };
    }
  }
  throw new TerminalUnavailableError(
    "No terminal emulator found. Set one in Preferences → Shortcuts → Terminal.",
  );
}

/** `command` existe no PATH (ou é um caminho absoluto executável)? */
export async function commandExists(command: string): Promise<boolean> {
  if (!command) return false;
  const candidates = command.includes("/")
    ? [command]
    : (process.env.PATH ?? "").split(delimiter).map(dir => join(dir, command));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return true;
    } catch {
      // próximo candidato
    }
  }
  return false;
}

export async function openTerminal(cwd: string, custom?: string): Promise<void> {
  const stat = await fs.stat(cwd).catch(() => null);
  if (!stat?.isDirectory()) throw new TerminalUnavailableError(`"${cwd}" is not a folder.`);

  const launch = await buildTerminalLaunch({
    platform: process.platform,
    cwd,
    custom,
    env: process.env,
    exists: commandExists,
  });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(launch.command, launch.args, {
      cwd,
      detached: true,
      stdio: "ignore",
      // `start ""` no Windows precisa das aspas literais, sem o escape do Node.
      windowsVerbatimArguments: process.platform === "win32",
    });
    child.once("error", error => {
      reject(new TerminalUnavailableError(`Could not start "${launch.command}": ${error.message}`));
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

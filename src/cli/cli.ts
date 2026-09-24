/**
 * `wttp run` (EP-13-T02): o Collection Runner do app no terminal, para o CI. Mesmo
 * núcleo (`src/main/runner`) — só mudam as dependências: segredos vêm de variáveis de
 * ambiente (não há keychain no CI) e os scripts rodam num processo Node filho, não num
 * `utilityProcess` do Electron. Nada aqui importa `electron`.
 *
 * `runCli` devolve o código de saída em vez de chamar `process.exit`, para ser testável
 * em processo: 0 = tudo passou, 1 = alguma request falhou (ou o run parou), 2 = uso
 * errado ou workspace/environment inválido.
 */

import type {
  EnvironmentListItem,
  RunCollectionOptions,
  RunPlanItem,
  RunRequestResult,
  RunSummary,
} from "@shared";

import { promises as fs } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

import type { RunnerDeps } from "../main/runner/execute";

import { runCollection } from "../main/runner/run";
import { listEnvironments } from "../main/storage/tree";
import {
  formatCliError,
  formatCliResult,
  formatCliSummary,
  formatJson,
  formatJunit,
  type ReporterName,
  type RunReport,
} from "./reporters";

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  env: Record<string, string | undefined>;
  cwd: string;
  color: boolean;
  /** Envio, cancelamento e scripts — o `index.ts` passa os de verdade; testes podem trocar. */
  deps: Omit<RunnerDeps, "secretValue">;
  writeFile(path: string, contents: string): Promise<void>;
  version: string;
  /** Sinal de interrupção (Ctrl+C) — aborta a request em andamento, como o Stop da UI. */
  signal?: AbortSignal;
}

export const HELP = `Usage: wttp run <path> [options]

Runs every request under <path> — a Wttp workspace, or a folder/collection inside one —
in tree order, with pre-request and test scripts, like the Runner in the app.

Options:
  -e, --env <name|file>     environment to use (its name, or the file in environments/)
  -n, --iterations <n>      run the whole list n times (default 1)
      --delay <ms>          wait between requests (default 0)
      --bail                stop at the first failing request
  -r, --reporter <list>     cli, json, junit — comma-separated or repeated (default cli)
  -o, --out <file>          where json/junit is written (default: stdout, if it's the only one)
      --var <name=value>    override a variable for this run (repeatable)
      --persist             write variables set by scripts back to disk (default: don't)
      --no-color            plain output
  -h, --help                show this help
  -v, --version             show the version

Secrets: a \`secret: true\` variable has no value in the YAML. Set it with an environment
variable WTTP_SECRET_<NAME> — name upper-cased, anything not A-Z/0-9 turned into "_"
(\`apiKey\` → WTTP_SECRET_APIKEY, \`client-secret\` → WTTP_SECRET_CLIENT_SECRET).

Exit code: 0 when every request passed, 1 when any failed, 2 on usage or setup errors.
`;

class UsageError extends Error {}

/**
 * Troca todo valor de segredo por `****` no que o run produziu — URL resolvida (API key em
 * query), mensagens de erro e de asserção, console dos scripts. É o que vai para o
 * terminal, para o log do CI e para os arquivos json/junit (EP-13-T03: "não vazar segredo
 * em log"), mesmo cuidado que o histórico do app já toma.
 */
export function maskResult(result: RunRequestResult, secrets: string[]): RunRequestResult {
  const values = [...new Set(secrets)]
    .filter(value => value.length > 0)
    .sort((a, b) => b.length - a.length);
  if (values.length === 0) return result;
  const mask = (text: string): string =>
    values.reduce((acc, value) => acc.split(value).join("****"), text);
  return {
    ...result,
    url: mask(result.url),
    error: result.error
      ? {
          ...result.error,
          error: { ...result.error.error, message: mask(result.error.error.message) },
        }
      : undefined,
    assertions: result.assertions.map(assertion => ({
      ...assertion,
      name: mask(assertion.name),
      message: assertion.message === undefined ? undefined : mask(assertion.message),
    })),
    console: result.console.map(entry => ({ ...entry, message: mask(entry.message) })),
  };
}

export function secretEnvName(variable: string): string {
  return `WTTP_SECRET_${variable.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

interface ParsedArgs {
  path: string;
  env?: string;
  iterations: number;
  delayMs: number;
  bail: boolean;
  reporters: ReporterName[];
  out?: string;
  overrides: Record<string, string>;
  persist: boolean;
  color: boolean;
}

function parse(argv: string[]): ParsedArgs | "help" | "version" {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      env: { type: "string", short: "e" },
      iterations: { type: "string", short: "n" },
      delay: { type: "string" },
      bail: { type: "boolean" },
      reporter: { type: "string", short: "r", multiple: true },
      out: { type: "string", short: "o" },
      var: { type: "string", multiple: true },
      persist: { type: "boolean" },
      "no-color": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (values.help) return "help";
  if (values.version) return "version";

  const [command, path, ...extra] = positionals;
  if (command !== "run")
    throw new UsageError(command ? `unknown command "${command}"` : "missing command");
  if (!path) throw new UsageError("missing <path> — the workspace or folder to run");
  if (extra.length) throw new UsageError(`unexpected argument "${extra[0]}"`);

  const integer = (
    raw: string | undefined,
    fallback: number,
    name: string,
    min: number,
  ): number => {
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min)
      throw new UsageError(`--${name} must be an integer ≥ ${min}`);
    return value;
  };

  const reporters = (values.reporter ?? ["cli"])
    .flatMap(entry => entry.split(","))
    .map(r => r.trim());
  for (const reporter of reporters) {
    if (reporter !== "cli" && reporter !== "json" && reporter !== "junit") {
      throw new UsageError(`unknown reporter "${reporter}" (use cli, json or junit)`);
    }
  }
  const machine = reporters.filter(r => r !== "cli");
  if (machine.length > 1) throw new UsageError("only one of json/junit per run");
  if (values.out && machine.length === 0)
    throw new UsageError("--out needs the json or junit reporter");

  const overrides: Record<string, string> = {};
  for (const entry of values.var ?? []) {
    const index = entry.indexOf("=");
    if (index <= 0) throw new UsageError(`--var expects name=value, got "${entry}"`);
    overrides[entry.slice(0, index)] = entry.slice(index + 1);
  }

  return {
    path,
    env: values.env,
    iterations: integer(values.iterations, 1, "iterations", 1),
    delayMs: integer(values.delay, 0, "delay", 0),
    bail: values.bail ?? false,
    reporters: [...new Set(reporters)] as ReporterName[],
    out: values.out,
    overrides,
    persist: values.persist ?? false,
    color: !values["no-color"],
  };
}

async function isFile(path: string): Promise<boolean> {
  return fs.stat(path).then(
    stat => stat.isFile(),
    () => false,
  );
}

/** Sobe a partir de `path` até achar o `wttp.yaml` — o alvo pode ser uma pasta de dentro do workspace. */
async function locate(path: string): Promise<{ root: string; target: string }> {
  const absolute = resolve(path);
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isDirectory()) throw new UsageError(`not a directory: ${path}`);
  let current = absolute;
  for (;;) {
    if (await isFile(join(current, "wttp.yaml"))) {
      return { root: current, target: relative(current, absolute).split(sep).join("/") };
    }
    const parent = dirname(current);
    if (parent === current)
      throw new UsageError(`not inside a Wttp workspace (no wttp.yaml above ${path})`);
    current = parent;
  }
}

function findEnvironment(items: EnvironmentListItem[], wanted: string): EnvironmentListItem {
  const byFile = items.find(item => item.path === wanted || item.path === `${wanted}.yaml`);
  const byName = items.filter(item => item.data.name === wanted);
  if (byFile) return byFile;
  if (byName.length === 1) return byName[0];
  const available = items.map(item => item.data.name).join(", ") || "none";
  throw new UsageError(
    byName.length > 1
      ? `more than one environment is named "${wanted}" — use the file name instead`
      : `environment "${wanted}" not found (available: ${available})`,
  );
}

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const style = { color: io.color };
  let args: ReturnType<typeof parse>;
  try {
    args = parse(argv);
  } catch (error) {
    io.stderr(
      `${formatCliError({ code: "INVALID_PAYLOAD", message: (error as Error).message }, style)}\n\n${HELP}`,
    );
    return EXIT_USAGE;
  }
  if (args === "help") {
    io.stdout(HELP);
    return EXIT_OK;
  }
  if (args === "version") {
    io.stdout(`${io.version}\n`);
    return EXIT_OK;
  }
  style.color = io.color && args.color;

  let root: string;
  let target: string;
  let environment: EnvironmentListItem | null = null;
  try {
    const cwdPath = isAbsolute(args.path) ? args.path : join(io.cwd, args.path);
    ({ root, target } = await locate(cwdPath));
    if (args.env) environment = findEnvironment(await listEnvironments(root), args.env);
  } catch (error) {
    io.stderr(
      `${formatCliError({ code: "INVALID_PAYLOAD", message: (error as Error).message }, style)}\n`,
    );
    return EXIT_USAGE;
  }

  // O relatório legível vai para o stdout, a não ser que json/junit ocupe o stdout.
  const machine = args.reporters.find(r => r !== "cli");
  const humanOut = machine && !args.out ? io.stderr : io.stdout;
  const showHuman = args.reporters.includes("cli");

  const missingSecrets = (environment?.data.variables ?? [])
    .filter(variable => variable.secret && io.env[secretEnvName(variable.name)] === undefined)
    .map(variable => `${variable.name} (${secretEnvName(variable.name)})`);
  if (missingSecrets.length && showHuman) {
    humanOut(`warning: secret variables without a value: ${missingSecrets.join(", ")}\n`);
  }

  const options: RunCollectionOptions = {
    root,
    targetPath: target,
    environmentPath: environment?.path ?? null,
    iterations: args.iterations,
    delayMs: args.delayMs,
    bail: args.bail,
    persistVariables: args.persist,
    overrides: args.overrides,
  };

  // Valores reais dos segredos deste run — tudo que sai do CLI passa por `maskResult`.
  const secretValues = (environment?.data.variables ?? [])
    .filter(variable => variable.secret)
    .map(variable => io.env[secretEnvName(variable.name)] ?? "");

  let plan: RunPlanItem[] = [];
  const results: RunRequestResult[] = [];
  let summary: RunSummary | null = null;
  let failure: string | null = null;

  await runCollection(
    options,
    { ...io.deps, secretValue: async (_env, name) => io.env[secretEnvName(name)] ?? null },
    io.signal ?? new AbortController().signal,
    {
      onEvent: event => {
        switch (event.type) {
          case "started":
            plan = event.plan;
            if (showHuman) {
              humanOut(
                `wttp run ${target || "."}  ·  ${plan.length} requests` +
                  `${args.iterations > 1 ? ` × ${args.iterations}` : ""}` +
                  `${environment ? `  ·  env ${environment.data.name}` : ""}\n\n`,
              );
            }
            break;
          case "requestFinished": {
            const result = maskResult(event.result, secretValues);
            results.push(result);
            if (showHuman) humanOut(`${formatCliResult(result, style, args.iterations > 1)}\n`);
            break;
          }
          case "finished":
            summary = event.summary;
            if (showHuman) humanOut(`${formatCliSummary(event.summary, style)}\n`);
            break;
          case "failed":
            failure = event.error.message;
            io.stderr(`${formatCliError(event.error, style)}\n`);
            break;
        }
      },
    },
  );

  if (failure !== null || !summary) return EXIT_USAGE;
  const finalSummary: RunSummary = summary;

  if (machine) {
    const report: RunReport = {
      workspace: root,
      target,
      environment: environment?.data.name ?? null,
      iterations: args.iterations,
      plan,
      results,
      summary: finalSummary,
    };
    const text = machine === "json" ? formatJson(report) : formatJunit(report);
    if (args.out)
      await io.writeFile(isAbsolute(args.out) ? args.out : join(io.cwd, args.out), text);
    else io.stdout(text);
  }

  return finalSummary.failed > 0 || finalSummary.endedEarly !== null ? EXIT_FAILED : EXIT_OK;
}

/**
 * API de scripting exposta ao código do usuário (EP-09-T02) — docs/scripting.md.
 *
 * Monta o objeto de globals que `sandbox.ts` contextifica e traduz o resultado da
 * execução para `ScriptRunResult`. Roda dentro do utility process (chamado por
 * `worker.ts`), nunca no main — mas não importa nada de `node:*`/`electron` além do
 * `node:vm` escondido em `sandbox.ts`, então continua testável com Vitest puro.
 */

import type {
  HttpRequestSpec,
  ScriptAssertion,
  ScriptConsoleEntry,
  ScriptRunResult,
  ScriptRunSpec,
} from "@shared";

import { runInSandbox } from "./sandbox";

const DEFAULT_TIMEOUT_MS = 5000;

function formatConsoleArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

function getPath(value: unknown, path: string): { found: boolean; value: unknown } {
  const segments = path.split(".").filter(Boolean);
  let current = value;
  for (const segment of segments) {
    if (current === null || typeof current !== "object" || !(segment in current)) {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(key =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

class AssertionFailure extends Error {}

function createExpect(): (actual: unknown) => Record<string, (...args: unknown[]) => void> {
  return (actual: unknown) => ({
    toBe(expected: unknown) {
      if (!Object.is(actual, expected)) {
        throw new AssertionFailure(`expected ${stringify(actual)} to be ${stringify(expected)}`);
      }
    },
    toEqual(expected: unknown) {
      if (!deepEqual(actual, expected)) {
        throw new AssertionFailure(`expected ${stringify(actual)} to equal ${stringify(expected)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new AssertionFailure(`expected ${stringify(actual)} to be truthy`);
      }
    },
    toContain(expected: unknown) {
      const contains =
        typeof actual === "string" || Array.isArray(actual)
          ? actual.includes(expected as never)
          : false;
      if (!contains) {
        throw new AssertionFailure(
          `expected ${stringify(actual)} to contain ${stringify(expected)}`,
        );
      }
    },
    toHaveProperty(path: unknown, expected?: unknown) {
      const result = getPath(actual, String(path));
      if (!result.found) {
        throw new AssertionFailure(`expected ${stringify(actual)} to have property "${path}"`);
      }
      if (arguments.length > 1 && !deepEqual(result.value, expected)) {
        throw new AssertionFailure(
          `expected property "${path}" to be ${stringify(expected)}, got ${stringify(result.value)}`,
        );
      }
    },
    toMatch(pattern: unknown) {
      // `pattern` pode ter vindo de um `/.../ ` literal criado *dentro* do vm — outro
      // realm, então `instanceof RegExp` (que compara o protótipo do realm de fora)
      // falha para um regex perfeitamente válido. `typeof .test === "function"` detecta
      // por duck-typing em vez de identidade de protótipo.
      const isRegexLike =
        pattern !== null &&
        typeof pattern === "object" &&
        typeof (pattern as { test?: unknown }).test === "function";
      const regex = isRegexLike ? (pattern as RegExp) : new RegExp(String(pattern));
      if (typeof actual !== "string" || !regex.test(actual)) {
        throw new AssertionFailure(`expected ${stringify(actual)} to match ${String(pattern)}`);
      }
    },
  });
}

/** `res` congelada para a fase `tests` (EP-09-T02) — mudar isso no script não afeta o que a UI mostra. */
function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function buildResponseView(spec: ScriptRunSpec): unknown {
  const res = spec.res;
  if (!res) return undefined;
  if (!res.ok) {
    return freezeDeep({ ok: false, error: res.error });
  }

  const headers: Record<string, string> = {};
  for (const header of res.headers) headers[header.name] = header.value;

  let body = "";
  try {
    body = new TextDecoder(res.charset || "utf-8").decode(res.body);
  } catch {
    body = new TextDecoder("utf-8").decode(res.body);
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    json = undefined;
  }

  return freezeDeep({
    ok: true,
    status: res.status,
    statusText: res.statusText,
    headers,
    body,
    json,
    size: res.size,
    timing: res.timing,
  });
}

export function executeScript(spec: ScriptRunSpec): ScriptRunResult {
  const vars: Record<string, string> = { ...spec.vars };
  const consoleEntries: ScriptConsoleEntry[] = [];
  const assertions: ScriptAssertion[] = [];
  const req: HttpRequestSpec | undefined = spec.req ? structuredClone(spec.req) : undefined;

  const consoleApi = {
    log: (...args: unknown[]) => {
      consoleEntries.push({
        level: "log",
        message: args.map(formatConsoleArg).join(" "),
        phase: spec.phase,
      });
    },
    warn: (...args: unknown[]) => {
      consoleEntries.push({
        level: "warn",
        message: args.map(formatConsoleArg).join(" "),
        phase: spec.phase,
      });
    },
    error: (...args: unknown[]) => {
      consoleEntries.push({
        level: "error",
        message: args.map(formatConsoleArg).join(" "),
        phase: spec.phase,
      });
    },
  };

  const wttpApi = {
    setVar: (name: unknown, value: unknown) => {
      vars[String(name)] = value === undefined || value === null ? "" : String(value);
    },
    getVar: (name: unknown) => vars[String(name)],
  };

  const testApi = (name: unknown, fn: unknown): void => {
    const start = Date.now();
    try {
      if (typeof fn !== "function")
        throw new Error("test() needs a function as its second argument");
      fn();
      assertions.push({ name: String(name), passed: true, durationMs: Date.now() - start });
    } catch (error) {
      assertions.push({
        name: String(name),
        passed: false,
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      });
    }
  };

  const globals: Record<string, unknown> = {
    console: consoleApi,
    wttp: wttpApi,
    test: testApi,
    expect: createExpect(),
  };
  if (spec.phase === "preRequest") globals.req = req;
  if (spec.phase === "tests") globals.res = buildResponseView(spec);

  const run = runInSandbox({
    code: spec.code,
    globals,
    timeoutMs: spec.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  if (!run.ok) {
    return {
      ok: false,
      vars,
      req: spec.phase === "preRequest" ? req : undefined,
      assertions,
      console: consoleEntries,
      error: {
        code: /timeout/i.test(run.message) ? "SCRIPT_TIMEOUT" : "UNKNOWN",
        message: run.message,
      },
    };
  }

  return {
    ok: true,
    vars,
    req: spec.phase === "preRequest" ? req : undefined,
    assertions,
    console: consoleEntries,
  };
}

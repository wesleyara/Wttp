/**
 * API de scripting exposta ao código do usuário (EP-09-T02) — arch-docs/scripting.md.
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

/**
 * O que a função de um flow devolveu → a saída (1-based) a seguir. Um número escolhe a saída;
 * um array, no estilo do Node-RED (`[msgA, null, msgC]`), escolhe a primeira posição que não é
 * `null`/`undefined`; `null`/`undefined` não segue por saída nenhuma e o flow termina ali.
 */
export function chooseOutput(
  returned: unknown,
  outputs: number,
): { output: number | null } | { error: string } {
  if (returned === undefined || returned === null) return { output: null };
  let output: number | null;
  if (typeof returned === "number") {
    if (!Number.isInteger(returned)) {
      return {
        error: `the function returned ${returned} — return a whole output number (1 to ${outputs})`,
      };
    }
    output = returned;
  } else if (Array.isArray(returned)) {
    const index = returned.findIndex(item => item !== null && item !== undefined);
    output = index === -1 ? null : index + 1;
  } else {
    return {
      error: `the function returned ${typeof returned} — return the output number to follow (1 to ${outputs}), an array like [a, null, c], or nothing to stop`,
    };
  }
  if (output !== null && (output < 1 || output > outputs)) {
    return {
      error: `the function chose output ${output}, but this node has ${outputs} output${outputs === 1 ? "" : "s"}`,
    };
  }
  return { output };
}

/** O código de um nó de função é o corpo de uma função: `return` escolhe a saída. */
function wrapFunctionBody(code: string): string {
  return `__output__ = (function () {\n${code}\n}).call(undefined);`;
}

export function executeScript(spec: ScriptRunSpec): ScriptRunResult {
  const envVars: Record<string, string> | null = spec.envVars ? { ...spec.envVars } : null;
  const collectionVars: Record<string, string> | null = spec.collectionVars
    ? { ...spec.collectionVars }
    : null;
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

  function coerce(value: unknown): string {
    return value === undefined || value === null ? "" : String(value);
  }

  const wttpApi = {
    setVar: (name: unknown, value: unknown) => {
      if (!envVars) {
        throw new Error(
          "No active environment — pick one before running this script (wttp.setVar writes into it).",
        );
      }
      envVars[String(name)] = coerce(value);
    },
    getVar: (name: unknown) => envVars?.[String(name)],
    setCollectionVar: (name: unknown, value: unknown) => {
      if (!collectionVars) {
        throw new Error(
          "This request isn't inside a collection — wttp.setCollectionVar has nowhere to write.",
        );
      }
      collectionVars[String(name)] = coerce(value);
    },
    getCollectionVar: (name: unknown) => collectionVars?.[String(name)],
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
  };
  const vars: Record<string, string> | undefined =
    spec.phase === "function" ? { ...spec.vars } : undefined;
  if (spec.phase === "preRequest") {
    globals.req = req;
  } else {
    globals.res = buildResponseView(spec);
    globals.test = testApi;
    globals.expect = createExpect();
    if (spec.phase === "function") {
      // `vars` é a camada de runtime do flow: o que o código escreve aqui vale como `{{nome}}` nos nós seguintes.
      globals.vars = vars;
      globals.__output__ = undefined;
    }
  }

  const run = runInSandbox({
    code: spec.phase === "function" ? wrapFunctionBody(spec.code) : spec.code,
    globals,
    timeoutMs: spec.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  /** `vars` voltam como texto, como nas demais camadas: o que o código atribuiu vira `String`. */
  const stringVars = vars
    ? Object.fromEntries(
        Object.entries(vars).map(([name, value]) => [name, value == null ? "" : String(value)]),
      )
    : undefined;

  if (!run.ok) {
    return {
      ok: false,
      envVars,
      collectionVars,
      req: spec.phase === "preRequest" ? req : undefined,
      vars: stringVars,
      assertions,
      console: consoleEntries,
      error: {
        code: /timeout/i.test(run.message) ? "SCRIPT_TIMEOUT" : "UNKNOWN",
        message: run.message,
      },
    };
  }

  if (spec.phase === "function") {
    const chosen = chooseOutput(globals.__output__, spec.outputs ?? 1);
    if ("error" in chosen) {
      return {
        ok: false,
        envVars,
        collectionVars,
        vars: stringVars,
        assertions,
        console: consoleEntries,
        error: { code: "UNKNOWN", message: chosen.error },
      };
    }
    return {
      ok: true,
      envVars,
      collectionVars,
      vars: stringVars,
      output: chosen.output,
      assertions,
      console: consoleEntries,
    };
  }

  return {
    ok: true,
    envVars,
    collectionVars,
    req: spec.phase === "preRequest" ? req : undefined,
    assertions,
    console: consoleEntries,
  };
}

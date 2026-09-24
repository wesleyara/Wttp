/**
 * Execução de uma request do jeito que o Send da UI faz (`useRequestTabsStore.dispatch`,
 * EP-06/EP-07/EP-09): herança de auth → `{{var}}` e path params → cadeia de pre-request
 * (collection → pasta → request) → envio → cadeia de tests (request → pasta →
 * collection). É o núcleo compartilhado do Collection Runner (EP-13-T01), do CLI
 * `wttp run` (EP-13-T02) e dos Flows (#57) — sem Electron: envio, scripts e segredos
 * chegam por `RunnerDeps`.
 */

import type {
  AuthConfig,
  EnvironmentFile,
  FolderNode,
  HttpRequestSpec,
  HttpResponseResult,
  KeyValueEntry,
  RequestScripts,
  RunAssertion,
  RunConsoleEntry,
  RunRequestResult,
  ScriptRunResult,
  ScriptRunSpec,
  WttpError,
} from "@shared";

import { randomUUID } from "node:crypto";

import type { PlannedRequest } from "./plan";

import { resolveAuthChain } from "../http/authInheritance";
import { resolveRequest, type VariableScope } from "../http/resolver";

export interface RunnerDeps {
  send(spec: HttpRequestSpec): Promise<HttpResponseResult>;
  cancel(requestId: string): void;
  runScript(spec: ScriptRunSpec): Promise<ScriptRunResult>;
  /** Valor real de uma variável `secret: true` (keychain no app, variável de ambiente no CLI). */
  secretValue(environmentPath: string, name: string): Promise<string | null>;
}

/**
 * Variáveis que evoluem ao longo de um run: o que `wttp.setVar`/`setCollectionVar`
 * gravam num elo da cadeia vale para os elos e as requests seguintes, como no envio
 * avulso (onde o valor vai para o disco e a próxima request o lê de lá).
 */
export class RunVariables {
  /** Como o script enxerga o environment: nome → valor, `secret: true` sempre `""`. */
  envVars: Record<string, string> | null;
  /** Por `path` da collection (pasta raiz), como o script enxerga `wttp.getCollectionVar`. */
  readonly collectionVars = new Map<string, Record<string, string>>();

  constructor(
    readonly environment: {
      path: string;
      file: EnvironmentFile;
      secrets: Record<string, string>;
    } | null,
    readonly workspaceVariables: KeyValueEntry[],
    readonly overrides: Record<string, string> = {},
  ) {
    this.envVars = environment
      ? Object.fromEntries(
          (environment.file.variables ?? []).map(v => [v.name, v.secret ? "" : v.value]),
        )
      : null;
  }

  collectionOf(item: PlannedRequest): FolderNode | undefined {
    return item.folders[item.folders.length - 1];
  }

  collectionVarsFor(collection: FolderNode | undefined): Record<string, string> | null {
    if (!collection) return null;
    let vars = this.collectionVars.get(collection.path);
    if (!vars) {
      vars = Object.fromEntries((collection.data?.variables ?? []).map(v => [v.name, v.value]));
      this.collectionVars.set(collection.path, vars);
    }
    return vars;
  }

  /** Escopo do resolvedor: arquivo + o que os scripts mudaram, segredo sempre do cofre. */
  scopeFor(item: PlannedRequest): VariableScope {
    const env = this.environment;
    const environment: KeyValueEntry[] = [];
    if (env) {
      const inFile = new Set<string>();
      for (const variable of env.file.variables ?? []) {
        inFile.add(variable.name);
        environment.push({
          name: variable.name,
          enabled: variable.enabled,
          value: variable.secret
            ? (env.secrets[variable.name] ?? "")
            : (this.envVars?.[variable.name] ?? variable.value),
        });
      }
      for (const [name, value] of Object.entries(this.envVars ?? {})) {
        if (!inFile.has(name)) environment.push({ name, value, enabled: true });
      }
    }

    const collection = this.collectionOf(item);
    const collectionEntries = item.folders.flatMap(folder => {
      const fileVars = folder.data?.variables ?? [];
      if (folder !== collection) return fileVars;
      const memory = this.collectionVarsFor(folder) ?? {};
      const names = new Set(fileVars.map(v => v.name));
      return [
        ...fileVars.map(v => ({ ...v, value: memory[v.name] ?? v.value })),
        ...Object.entries(memory)
          .filter(([name]) => !names.has(name))
          .map(([name, value]) => ({ name, value, enabled: true })),
      ];
    });

    return {
      runtime: this.overrides,
      environment,
      collection: collectionEntries,
      workspace: this.workspaceVariables,
    };
  }
}

interface ChainLink {
  source: string;
  code: string;
}

/**
 * Elos com código para a fase, na ordem de execução — mesma regra de
 * `src/renderer/src/lib/scriptChain.ts`: pre-request de fora para dentro (collection
 * primeiro, request por último), tests de dentro para fora.
 */
function chainFor(item: PlannedRequest, phase: "preRequest" | "tests"): ChainLink[] {
  const inside: { source: string; scripts: RequestScripts | undefined }[] = [
    { source: "This request", scripts: item.node.data.scripts },
    ...item.folders.map(folder => ({ source: folder.name, scripts: folder.data?.scripts })),
  ];
  const ordered = phase === "preRequest" ? inside.reverse() : inside;
  return ordered
    .map(link => ({ source: link.source, code: link.scripts?.[phase]?.trim() ?? "" }))
    .filter(link => link.code.length > 0);
}

export interface ExecuteOptions {
  iteration: number;
  index: number;
  scriptTimeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * URL como foi para a rede — a engine descarta a query embutida e usa a tabela
 * (`applyQuery`); a API key em query entra depois, no `applyAuth`, e fica de fora aqui.
 */
function sentUrl(spec: HttpRequestSpec): string {
  try {
    const url = new URL(spec.url);
    url.search = "";
    for (const entry of spec.query)
      if (entry.enabled) url.searchParams.append(entry.name, entry.value);
    return url.href;
  } catch {
    return spec.url;
  }
}

function effectiveAuth(item: PlannedRequest): AuthConfig {
  return resolveAuthChain([item.node.data.auth, ...item.folders.map(folder => folder.data?.auth)])
    .auth;
}

export async function executeRequest(
  item: PlannedRequest,
  variables: RunVariables,
  deps: RunnerDeps,
  options: ExecuteOptions,
): Promise<RunRequestResult> {
  const startedAt = Date.now();
  const data = item.node.data;
  const collection = variables.collectionOf(item);
  const assertions: RunAssertion[] = [];
  const consoleEntries: RunConsoleEntry[] = [];

  const scriptBase = (): Omit<ScriptRunSpec, "code" | "phase"> => ({
    envVars: variables.envVars,
    activeEnvironmentName: variables.environment?.file.name,
    collectionVars: variables.collectionVarsFor(collection),
    collectionName: collection?.name,
    timeoutMs: options.scriptTimeoutMs,
  });
  const absorb = (result: ScriptRunResult, source: string): void => {
    consoleEntries.push(...result.console.map(entry => ({ ...entry, source })));
    variables.envVars = result.envVars;
    if (collection && result.collectionVars) {
      variables.collectionVars.set(collection.path, result.collectionVars);
    }
  };

  const resolved = resolveRequest(
    {
      url: data.url,
      pathParams: data.pathParams ?? [],
      query: data.query ?? [],
      headers: data.headers ?? [],
      auth: effectiveAuth(item),
      body: data.body ?? { type: "none" },
    },
    variables.scopeFor(item),
  );

  const base: Omit<RunRequestResult, "url" | "status" | "durationMs" | "passed" | "cancelled"> = {
    iteration: options.iteration,
    index: options.index,
    path: item.node.path,
    name: item.node.name,
    method: data.method,
    assertions,
    console: consoleEntries,
    unresolved: resolved.unresolved,
  };

  let spec: HttpRequestSpec = {
    requestId: randomUUID(),
    method: data.method,
    url: resolved.url,
    query: resolved.query,
    headers: resolved.headers,
    auth: resolved.auth,
    body: resolved.body,
  };

  for (const link of chainFor(item, "preRequest")) {
    const result = await deps.runScript({
      ...scriptBase(),
      code: link.code,
      phase: "preRequest",
      req: spec,
    });
    absorb(result, link.source);
    if (!result.ok) {
      const error: WttpError = result.error ?? {
        code: "UNKNOWN",
        message: "Pre-request script failed",
      };
      return {
        ...base,
        url: sentUrl(spec),
        status: null,
        durationMs: Date.now() - startedAt,
        passed: false,
        cancelled: false,
        error: { source: link.source, error },
      };
    }
    if (result.req) spec = { ...result.req, requestId: spec.requestId };
  }

  const onAbort = (): void => deps.cancel(spec.requestId);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  let response: HttpResponseResult;
  try {
    response = options.signal?.aborted
      ? {
          ok: false,
          requestId: spec.requestId,
          error: { code: "CANCELLED", message: "Run stopped" },
        }
      : await deps.send(spec);
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok && response.error.code === "CANCELLED") {
    return {
      ...base,
      url: sentUrl(spec),
      status: null,
      durationMs: Date.now() - startedAt,
      passed: false,
      cancelled: true,
    };
  }

  for (const link of chainFor(item, "tests")) {
    const result = await deps.runScript({
      ...scriptBase(),
      code: link.code,
      phase: "tests",
      res: response,
    });
    absorb(result, link.source);
    assertions.push(...result.assertions.map(assertion => ({ ...assertion, source: link.source })));
    if (!result.ok && result.error) {
      assertions.push({
        name: `${link.source} script`,
        passed: false,
        message: result.error.message,
        durationMs: 0,
        source: link.source,
      });
    }
  }

  return {
    ...base,
    url: sentUrl(spec),
    status: response.ok ? response.status : null,
    durationMs: response.ok ? Math.round(response.timing.total) : Date.now() - startedAt,
    passed: response.ok && assertions.every(assertion => assertion.passed),
    cancelled: false,
    ...(response.ok ? {} : { error: { error: response.error } }),
  };
}

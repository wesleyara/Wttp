/**
 * Validação de schema dos arquivos YAML de workspace — arch-docs/file-format.md §7.
 * Roda antes de `parser.ts`: um arquivo sintaticamente quebrado ou com campo do tipo
 * errado nunca lança exceção aqui, só devolve `issues` com mensagem, caminho do campo
 * e linha. Quem chama (a camada de filesystem, EP-04-T04) decide o que fazer com um
 * nó inválido — o resto do workspace continua utilizável.
 *
 * `wttp` ausente não é erro de schema: vira versão 1 com aviso em `warnings`
 * (`resolveSchemaVersion`, EP-04-T03). Uma versão maior que a suportada é a única
 * situação de versão que vira issue — recusa abrir em vez de adivinhar o formato.
 */

import type { EnvironmentFile, FlowFile, FolderFile, RequestFile, WorkspaceFile } from "@shared";

import {
  CONDITION_OPS,
  CONDITION_SOURCES,
  type ConditionOp,
  opNeedsValue,
} from "@shared/condition";
import {
  DEFAULT_MAX_FLOW_STEPS,
  FLOW_SCHEMA_VERSION,
  MAX_DELAY_MS,
  MAX_FLOW_STEPS_LIMIT,
  MAX_FUNCTION_OUTPUTS,
  MAX_POLL_ATTEMPTS,
  MIN_POLL_INTERVAL_MS,
} from "@shared/flow";
import {
  FLOW_NODE_ID_PATTERN,
  FLOW_VARIABLE_PATTERN,
  parseMappingSource,
} from "@shared/flowMapping";
import { type Document, isNode, LineCounter, parseDocument } from "yaml";

import { flowUnsupportedVersionMessage, flowVersionOf } from "./migrations/flow";
import {
  CURRENT_SCHEMA_VERSION,
  resolveSchemaVersion,
  unsupportedVersionMessage,
} from "./migrations/registry";
import { parseEnvironment, parseFlow, parseFolder, parseRequest, parseWorkspace } from "./parser";

export interface SchemaIssue {
  /** Caminho pontuado até o campo problemático, ex. "settings.timeout" ou "variables.0.name". */
  path: string;
  message: string;
  /** 1-indexed. Ausente quando o problema não é localizável num campo do arquivo. */
  line?: number;
}

export type ValidationResult<T> =
  { valid: true; value: T; warnings?: string[] } | { valid: false; issues: SchemaIssue[] };

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const BODY_TYPES = ["none", "json", "urlencoded", "raw", "multipart", "binary"] as const;
const AUTH_TYPES = ["none", "inherit", "bearer", "basic", "apikey"] as const;

/** Formata um `SchemaIssue` no layout de arch-docs/file-format.md §7. */
export function formatSchemaIssue(filePath: string, issue: SchemaIssue): string {
  const location = issue.line !== undefined ? `${filePath}:${issue.line}` : filePath;
  return `${location}\n  SCHEMA_INVALID — ${issue.message}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeLabel(type: "string" | "number" | "boolean"): string {
  if (type === "string") return "uma string";
  if (type === "number") return "um número";
  return "um booleano";
}

type Path = (string | number)[];

/** Acumula issues percorrendo o `Document` do `yaml`, resolvendo linha via `range`. */
class Checker {
  readonly issues: SchemaIssue[] = [];

  constructor(
    private readonly doc: Document,
    private readonly lineCounter: LineCounter,
  ) {}

  /** Linha do nó em `path`, ou do ancestral mais próximo presente no arquivo. */
  private lineFor(path: Path): number | undefined {
    for (let end = path.length; end >= 0; end--) {
      const node: unknown = this.doc.getIn(path.slice(0, end), true);
      if (isNode(node) && node.range) return this.lineCounter.linePos(node.range[0]).line;
    }
    return undefined;
  }

  fail(path: Path, message: string): void {
    this.issues.push({ path: path.join("."), message, line: this.lineFor(path) });
  }

  /**
   * `doc.getIn` sem `keepScalar` devolve `YAMLMap`/`YAMLSeq` para coleções, não
   * objeto/array JS — `.toJSON()` resolve o nó inteiro, mantendo `Array.isArray` e
   * `typeof` funcionando como esperado nos checks abaixo.
   */
  get(path: Path): unknown {
    const node: unknown = this.doc.getIn(path, true);
    return isNode(node) ? node.toJSON() : node;
  }

  required(path: Path, type: "string" | "number" | "boolean"): void {
    const value = this.get(path);
    const field = String(path[path.length - 1]);
    if (value === undefined) {
      this.fail(path, `"${field}" é obrigatório`);
      return;
    }
    if (typeof value !== type) {
      this.fail(
        path,
        `"${field}" deve ser ${typeLabel(type)} (recebido: ${JSON.stringify(value)})`,
      );
    }
  }

  optional(path: Path, type: "string" | "number" | "boolean"): void {
    const value = this.get(path);
    if (value === undefined) return;
    const field = String(path[path.length - 1]);
    if (typeof value !== type) {
      this.fail(
        path,
        `"${field}" deve ser ${typeLabel(type)} (recebido: ${JSON.stringify(value)})`,
      );
    }
  }

  /** Valida um campo enum. `description` substitui a lista de valores na mensagem. */
  enumField(
    path: Path,
    allowed: readonly string[],
    required: boolean,
    description?: string,
  ): string | undefined {
    const value = this.get(path);
    const field = String(path[path.length - 1]);
    if (value === undefined) {
      if (required) this.fail(path, `"${field}" é obrigatório`);
      return undefined;
    }
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
      const what = description ?? `um de ${allowed.join(", ")}`;
      this.fail(path, `"${field}" deve ser ${what} (recebido: ${JSON.stringify(value)})`);
      return undefined;
    }
    return value;
  }

  keyValueArray(path: Path, withSecret = false): void {
    const value = this.get(path);
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      this.fail(path, `"${String(path[path.length - 1])}" deve ser uma lista`);
      return;
    }
    value.forEach((_, index) => {
      const item = [...path, index];
      this.required([...item, "name"], "string");
      this.required([...item, "value"], "string");
      this.required([...item, "enabled"], "boolean");
      this.optional([...item, "description"], "string");
      if (withSecret) this.optional([...item, "secret"], "boolean");
    });
  }

  authConfig(path: Path): void {
    if (this.get(path) === undefined) return;
    const type = this.enumField(
      [...path, "type"],
      AUTH_TYPES,
      true,
      `um tipo de auth válido (${AUTH_TYPES.join(", ")})`,
    );
    if (type === "bearer") this.required([...path, "bearer", "token"], "string");
    if (type === "basic") {
      this.required([...path, "basic", "username"], "string");
      this.required([...path, "basic", "password"], "string");
    }
    if (type === "apikey") {
      this.required([...path, "apikey", "key"], "string");
      this.required([...path, "apikey", "value"], "string");
      this.enumField([...path, "apikey", "in"], ["header", "query"], true);
    }
  }

  body(path: Path): void {
    if (this.get(path) === undefined) return;
    const type = this.enumField(
      [...path, "type"],
      BODY_TYPES,
      true,
      `um tipo de body válido (${BODY_TYPES.join(", ")})`,
    );
    if (type === "json") this.required([...path, "json"], "string");
    if (type === "urlencoded") this.keyValueArray([...path, "urlencoded"]);
    if (type === "raw") {
      this.required([...path, "raw"], "string");
      this.required([...path, "contentType"], "string");
    }
    if (type === "multipart") {
      const items = this.get([...path, "multipart"]);
      if (items === undefined) {
        this.fail([...path, "multipart"], `"multipart" é obrigatório`);
      } else if (!Array.isArray(items)) {
        this.fail([...path, "multipart"], `"multipart" deve ser uma lista`);
      } else {
        items.forEach((_, index) => {
          const item = [...path, "multipart", index];
          this.required([...item, "name"], "string");
          this.enumField([...item, "type"], ["text", "file"], true);
          this.required([...item, "value"], "string");
          this.required([...item, "enabled"], "boolean");
        });
      }
    }
    if (type === "binary") this.required([...path, "binary"], "string");
  }

  /** Uma condição estruturada (`when`) de um nó `condition` ou `pollUntil`. */
  condition(path: Path): void {
    if (this.get(path) === undefined) {
      this.fail(path, `"${String(path[path.length - 1])}" é obrigatório`);
      return;
    }
    const source = this.enumField([...path, "source"], CONDITION_SOURCES, true);
    if (source === undefined || source === "assertions") return;
    if (source === "body" || source === "header") this.required([...path, "path"], "string");
    else this.optional([...path, "path"], "string");
    const op = this.enumField([...path, "op"], CONDITION_OPS, true) as ConditionOp | undefined;
    if (op !== undefined && opNeedsValue(op)) this.required([...path, "value"], "string");
    else this.optional([...path, "value"], "string");
  }

  /** `nodes`/`edges`/`mappings` de um flow (arch-docs/file-format.md §10), v1 (lista linear) ou v2 (grafo). */
  flow(version: number): void {
    const nodes = this.get(["nodes"]);
    const ids = new Map<string, string>();
    /** Saídas declaradas por cada nó `function` — as arestas dele precisam caber nesse número. */
    const functionOutputs = new Map<string, number>();
    if (nodes === undefined) {
      this.fail(["nodes"], `"nodes" é obrigatório`);
    } else if (!Array.isArray(nodes)) {
      this.fail(["nodes"], `"nodes" deve ser uma lista`);
    } else {
      nodes.forEach((raw: unknown, index) => {
        const item = ["nodes", index];
        const id = this.get([...item, "id"]);
        this.required([...item, "id"], "string");
        let type: string | undefined = "request";
        if (version >= 2) {
          type = this.enumField(
            [...item, "type"],
            ["request", "condition", "pollUntil", "delay", "function"],
            true,
            "um tipo de nó válido (request, condition, pollUntil, delay, function)",
          );
        }
        if (typeof id === "string") {
          if (!FLOW_NODE_ID_PATTERN.test(id)) {
            this.fail(
              [...item, "id"],
              `"id" deve usar só letras, números, "_" e "-" (recebido: ${JSON.stringify(id)})`,
            );
          } else if (ids.has(id)) {
            this.fail([...item, "id"], `o id "${id}" aparece em mais de um nó`);
          }
          ids.set(id, type ?? "");
        }
        if (type === "request") {
          this.required([...item, "request"], "string");
          const request = this.get([...item, "request"]);
          if (typeof request === "string" && !request.endsWith(".req.yaml")) {
            this.fail(
              [...item, "request"],
              `"request" deve apontar para um arquivo *.req.yaml (recebido: ${JSON.stringify(request)})`,
            );
          }
        }
        if (type === "condition" || type === "pollUntil") this.condition([...item, "when"]);
        if (type === "pollUntil") {
          this.required([...item, "intervalMs"], "number");
          const interval = this.get([...item, "intervalMs"]);
          if (typeof interval === "number" && interval < MIN_POLL_INTERVAL_MS) {
            this.fail(
              [...item, "intervalMs"],
              `"intervalMs" deve ser no mínimo ${MIN_POLL_INTERVAL_MS}`,
            );
          }
          this.required([...item, "maxAttempts"], "number");
          const attempts = this.get([...item, "maxAttempts"]);
          if (
            typeof attempts === "number" &&
            (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_POLL_ATTEMPTS)
          ) {
            this.fail(
              [...item, "maxAttempts"],
              `"maxAttempts" deve ser um inteiro entre 1 e ${MAX_POLL_ATTEMPTS} — o poll nunca fica preso esperando`,
            );
          }
        }
        if (type === "delay") {
          this.required([...item, "ms"], "number");
          const ms = this.get([...item, "ms"]);
          if (typeof ms === "number" && (ms < 0 || ms > MAX_DELAY_MS)) {
            this.fail([...item, "ms"], `"ms" deve estar entre 0 e ${MAX_DELAY_MS}`);
          }
        }
        if (type === "function") {
          this.required([...item, "code"], "string");
          this.required([...item, "outputs"], "number");
          const outputs = this.get([...item, "outputs"]);
          if (
            typeof outputs === "number" &&
            (!Number.isInteger(outputs) || outputs < 1 || outputs > MAX_FUNCTION_OUTPUTS)
          ) {
            this.fail(
              [...item, "outputs"],
              `"outputs" deve ser um inteiro entre 1 e ${MAX_FUNCTION_OUTPUTS}`,
            );
          } else if (typeof outputs === "number" && typeof id === "string") {
            functionOutputs.set(id, outputs);
          }
        }
        this.optional([...item, "x"], "number");
        this.optional([...item, "y"], "number");
        void raw;
      });
    }

    if (version >= 2) this.flowGraph(ids, functionOutputs);

    const mappings = this.get(["mappings"]);
    if (mappings === undefined) return;
    if (!Array.isArray(mappings)) {
      this.fail(["mappings"], `"mappings" deve ser uma lista`);
      return;
    }
    mappings.forEach((_, index) => {
      const item = ["mappings", index];
      this.required([...item, "from"], "string");
      this.required([...item, "to"], "string");
      const from = this.get([...item, "from"]);
      if (typeof from === "string") {
        const source = parseMappingSource(from);
        if (!source) {
          this.fail(
            [...item, "from"],
            `"from" deve ser <nó>.res.status, <nó>.res.headers.<Nome> ou <nó>.res.body.<caminho> (recebido: ${JSON.stringify(from)})`,
          );
        } else if (Array.isArray(nodes) && !ids.has(source.nodeId)) {
          this.fail(
            [...item, "from"],
            `"from" cita o nó "${source.nodeId}", que não existe neste flow`,
          );
        } else if (version >= 2 && ids.get(source.nodeId) !== "request") {
          this.fail(
            [...item, "from"],
            `"from" cita o nó "${source.nodeId}", que não é um nó de request`,
          );
        }
      }
      const to = this.get([...item, "to"]);
      if (typeof to === "string" && !FLOW_VARIABLE_PATTERN.test(to)) {
        this.fail(
          [...item, "to"],
          `"to" deve ser um nome de variável válido (recebido: ${JSON.stringify(to)})`,
        );
      }
    });
  }

  /** `start`, `edges` e `maxSteps` (só v2): ligações entre nós que existem, uma saída por nó (duas num `condition`). */
  private flowGraph(ids: Map<string, string>, functionOutputs: Map<string, number>): void {
    const start = this.get(["start"]);
    this.optional(["start"], "string");
    if (typeof start === "string" && !ids.has(start)) {
      this.fail(["start"], `"start" cita o nó "${start}", que não existe neste flow`);
    }
    const maxSteps = this.get(["maxSteps"]);
    this.optional(["maxSteps"], "number");
    if (
      typeof maxSteps === "number" &&
      (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_FLOW_STEPS_LIMIT)
    ) {
      this.fail(
        ["maxSteps"],
        `"maxSteps" deve ser um inteiro entre 1 e ${MAX_FLOW_STEPS_LIMIT} (padrão: ${DEFAULT_MAX_FLOW_STEPS})`,
      );
    }

    const edges = this.get(["edges"]);
    if (edges === undefined) return;
    if (!Array.isArray(edges)) {
      this.fail(["edges"], `"edges" deve ser uma lista`);
      return;
    }
    const outputs = new Set<string>();
    edges.forEach((_, index) => {
      const item = ["edges", index];
      this.required([...item, "from"], "string");
      this.required([...item, "to"], "string");
      this.optional([...item, "when"], "boolean");
      this.optional([...item, "output"], "number");
      const from = this.get([...item, "from"]);
      const to = this.get([...item, "to"]);
      const when = this.get([...item, "when"]);
      const output = this.get([...item, "output"]);
      for (const [field, id] of [
        ["from", from],
        ["to", to],
      ] as const) {
        if (typeof id === "string" && !ids.has(id)) {
          this.fail([...item, field], `"${field}" cita o nó "${id}", que não existe neste flow`);
        }
      }
      if (typeof from !== "string" || !ids.has(from)) return;
      const isCondition = ids.get(from) === "condition";
      const isFunction = ids.get(from) === "function";
      if (isCondition && typeof when !== "boolean") {
        this.fail(
          [...item, "when"],
          `uma saída de condição precisa de "when: true" ou "when: false"`,
        );
      }
      if (!isCondition && when !== undefined) {
        this.fail([...item, "when"], `só um nó de condição tem saídas true/false`);
      }
      if (isFunction) {
        const declared = functionOutputs.get(from) ?? MAX_FUNCTION_OUTPUTS;
        if (
          typeof output !== "number" ||
          !Number.isInteger(output) ||
          output < 1 ||
          output > declared
        ) {
          this.fail(
            [...item, "output"],
            `uma saída de função precisa de "output" entre 1 e ${declared} (as saídas de "${from}")`,
          );
        }
      } else if (output !== undefined) {
        this.fail([...item, "output"], `só um nó de função tem saídas numeradas`);
      }
      const key = `${from}:${String(when)}:${String(output)}`;
      if (outputs.has(key)) {
        this.fail(
          item,
          isCondition
            ? `a saída ${String(when)} de "${from}" já está ligada`
            : isFunction
              ? `a saída ${String(output)} de "${from}" já está ligada`
              : `o nó "${from}" já tem uma saída — só uma condição ou uma função se dividem em várias`,
        );
      }
      outputs.add(key);
    });
  }

  settingsBlock(path: Path, withScriptTimeout: boolean): void {
    if (this.get(path) === undefined) return;
    this.optional([...path, "timeout"], "number");
    this.optional([...path, "followRedirects"], "boolean");
    this.optional([...path, "maxRedirects"], "number");
    this.optional([...path, "validateTls"], "boolean");
    if (withScriptTimeout) this.optional([...path, "scriptTimeout"], "number");
  }
}

/**
 * Parseia sem nunca lançar. Usa `parseDocument`, não `parse()`: a primeira coleta erros
 * de sintaxe em `doc.errors`, a segunda lança o primeiro deles — é essa escolha que
 * garante que nenhuma exceção de sintaxe escape desta camada.
 */
function parseYamlSafe(raw: string): {
  doc: Document;
  lineCounter: LineCounter;
  syntaxIssues: SchemaIssue[];
} {
  const lineCounter = new LineCounter();
  const doc = parseDocument(raw, { lineCounter });
  const syntaxIssues = doc.errors.map(error => ({
    path: "",
    message: error.message,
    line: error.linePos?.[0]?.line,
  }));
  return { doc, lineCounter, syntaxIssues };
}

const ROOT_NOT_MAP_ISSUE: SchemaIssue = {
  path: "",
  message: "o arquivo deve ter um mapa no nível raiz",
  line: 1,
};

function validateFile<T>(
  raw: string,
  check: (checker: Checker) => void,
  reparse: (raw: string) => T,
  /** Versão máxima que o tipo de arquivo entende, e a mensagem de recusa — o flow tem a própria. */
  versioning?: {
    current: number;
    unsupported: (version: number) => string;
    resolve: (root: Record<string, unknown>) => number;
  },
): ValidationResult<T> {
  const { doc, lineCounter, syntaxIssues } = parseYamlSafe(raw);
  if (syntaxIssues.length > 0) return { valid: false, issues: syntaxIssues };

  const rootValue = doc.toJS();
  if (!isPlainObject(rootValue)) return { valid: false, issues: [ROOT_NOT_MAP_ISSUE] };

  const checker = new Checker(doc, lineCounter);
  checker.optional(["wttp"], "number");

  const resolved = resolveSchemaVersion(rootValue);
  const warning = resolved.warning;
  const version = versioning ? versioning.resolve(rootValue) : resolved.version;
  const current = versioning?.current ?? CURRENT_SCHEMA_VERSION;
  if (Number.isFinite(version) && version > current) {
    checker.fail(["wttp"], (versioning?.unsupported ?? unsupportedVersionMessage)(version));
  }

  check(checker);

  if (checker.issues.length > 0) return { valid: false, issues: checker.issues };
  return { valid: true, value: reparse(raw), warnings: warning ? [warning] : undefined };
}

export function validateWorkspace(raw: string): ValidationResult<WorkspaceFile> {
  return validateFile(
    raw,
    checker => {
      checker.required(["name"], "string");
      checker.optional(["description"], "string");
      checker.optional(["defaultEnvironment"], "string");
      checker.settingsBlock(["settings"], true);
      checker.keyValueArray(["variables"]);
    },
    parseWorkspace,
  );
}

export function validateFolder(raw: string): ValidationResult<FolderFile> {
  return validateFile(
    raw,
    checker => {
      checker.required(["name"], "string");
      checker.required(["seq"], "number");
      checker.authConfig(["auth"]);
      checker.keyValueArray(["variables"]);
      if (checker.get(["scripts"]) !== undefined) {
        checker.optional(["scripts", "preRequest"], "string");
        checker.optional(["scripts", "tests"], "string");
      }
      checker.optional(["docs"], "string");
    },
    parseFolder,
  );
}

export function validateRequest(raw: string): ValidationResult<RequestFile> {
  return validateFile(
    raw,
    checker => {
      checker.required(["name"], "string");
      checker.required(["seq"], "number");
      checker.enumField(["method"], HTTP_METHODS, true, "um método HTTP válido");
      checker.required(["url"], "string");
      checker.keyValueArray(["pathParams"]);
      checker.keyValueArray(["query"]);
      checker.keyValueArray(["headers"]);
      checker.authConfig(["auth"]);
      checker.body(["body"]);
      checker.settingsBlock(["settings"], false);
      if (checker.get(["scripts"]) !== undefined) {
        checker.optional(["scripts", "preRequest"], "string");
        checker.optional(["scripts", "tests"], "string");
      }
      checker.optional(["docs"], "string");
    },
    parseRequest,
  );
}

export function validateEnvironment(raw: string): ValidationResult<EnvironmentFile> {
  return validateFile(
    raw,
    checker => {
      checker.required(["name"], "string");
      checker.keyValueArray(["variables"], true);
    },
    parseEnvironment,
  );
}

export function validateFlow(raw: string): ValidationResult<FlowFile> {
  return validateFile(
    raw,
    checker => {
      checker.required(["name"], "string");
      const declared = checker.get(["wttp"]);
      checker.flow(typeof declared === "number" ? declared : 1);
    },
    parseFlow,
    {
      current: FLOW_SCHEMA_VERSION,
      unsupported: flowUnsupportedVersionMessage,
      resolve: flowVersionOf,
    },
  );
}

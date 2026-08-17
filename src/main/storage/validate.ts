/**
 * Validação de schema dos arquivos YAML de workspace — docs/file-format.md §7.
 * Roda antes de `parser.ts`: um arquivo sintaticamente quebrado ou com campo do tipo
 * errado nunca lança exceção aqui, só devolve `issues` com mensagem, caminho do campo
 * e linha. Quem chama (a camada de filesystem, EP-04-T04) decide o que fazer com um
 * nó inválido — o resto do workspace continua utilizável.
 *
 * `wttp` ausente não é erro de schema aqui: tratar a ausência como versão 1, com
 * aviso, é responsabilidade do migrador (EP-04-T03). Este módulo só valida o tipo do
 * campo quando ele está presente.
 */

import type { EnvironmentFile, FolderFile, RequestFile, WorkspaceFile } from "@shared";

import { type Document, isNode, LineCounter, parseDocument } from "yaml";

import { parseEnvironment, parseFolder, parseRequest, parseWorkspace } from "./parser";

export interface SchemaIssue {
  /** Caminho pontuado até o campo problemático, ex. "settings.timeout" ou "variables.0.name". */
  path: string;
  message: string;
  /** 1-indexed. Ausente quando o problema não é localizável num campo do arquivo. */
  line?: number;
}

export type ValidationResult<T> =
  { valid: true; value: T } | { valid: false; issues: SchemaIssue[] };

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const BODY_TYPES = ["none", "json", "urlencoded", "raw", "multipart", "binary"] as const;
const AUTH_TYPES = ["none", "inherit", "bearer", "basic", "apikey"] as const;

/** Formata um `SchemaIssue` no layout de docs/file-format.md §7. */
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

  private fail(path: Path, message: string): void {
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
): ValidationResult<T> {
  const { doc, lineCounter, syntaxIssues } = parseYamlSafe(raw);
  if (syntaxIssues.length > 0) return { valid: false, issues: syntaxIssues };

  if (!isPlainObject(doc.toJS())) return { valid: false, issues: [ROOT_NOT_MAP_ISSUE] };

  const checker = new Checker(doc, lineCounter);
  checker.optional(["wttp"], "number");
  check(checker);

  if (checker.issues.length > 0) return { valid: false, issues: checker.issues };
  return { valid: true, value: reparse(raw) };
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

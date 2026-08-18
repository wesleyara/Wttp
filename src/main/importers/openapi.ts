/**
 * OpenAPI 3.0/3.1 — JSON ou YAML (EP-08-T04). Ao contrário dos outros três formatos,
 * uma spec OpenAPI não descreve uma collection de requests prontas — descreve um
 * contrato de API. `normalize` gera uma collection navegável a partir dele: um endpoint
 * por operação (`method` + `path`), corpo de exemplo derivado do `schema` quando não há
 * `example`/`examples` explícito, `:param` extraído de `{param}` no path (mesma sintaxe
 * de path param que o resolvedor de EP-06.1 já entende), um environment por `servers[]`
 * e auth por `securitySchemes`.
 *
 * `$ref` só é resolvido internamente (`#/components/...`) — sem `$ref` remoto/externo,
 * fora do escopo da task. `generateExample` é a única função que precisa de guarda
 * contra ciclo: um schema pode se referenciar (`Pet.friends: Pet[]`) direta ou
 * indiretamente: `visiting` rastreia os ponteiros `$ref` já abertos nesse ramo de
 * recursão e corta (devolve `null`) ao encontrar um repetido, em vez de estourar a
 * pilha.
 */

import type { AuthConfig, HttpMethod, ImportReportItem, KeyValueEntry, RequestBody } from "@shared";

import { parse as parseYaml } from "yaml";

import type {
  Importer,
  NormalizedEnvironment,
  NormalizedImport,
  NormalizedNode,
  NormalizedRequest,
} from "./types";

// ---- Shape da spec — só os campos que este importador lê. ----

interface OpenApiRef {
  $ref: string;
}

type Derefable<T> = T | OpenApiRef;

interface OpenApiSchemaObject {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, Derefable<OpenApiSchemaObject>>;
  items?: Derefable<OpenApiSchemaObject>;
  allOf?: Array<Derefable<OpenApiSchemaObject>>;
  oneOf?: Array<Derefable<OpenApiSchemaObject>>;
  anyOf?: Array<Derefable<OpenApiSchemaObject>>;
  enum?: unknown[];
  example?: unknown;
  examples?: unknown[];
  format?: string;
}

interface OpenApiMediaType {
  schema?: Derefable<OpenApiSchemaObject>;
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
}

interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: Derefable<OpenApiSchemaObject>;
  example?: unknown;
}

interface OpenApiRequestBody {
  content?: Record<string, OpenApiMediaType>;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Array<Derefable<OpenApiParameter>>;
  requestBody?: Derefable<OpenApiRequestBody>;
  security?: Array<Record<string, string[]>>;
}

const HTTP_METHOD_KEYS = ["get", "put", "post", "delete", "options", "head", "patch"] as const;

type OpenApiPathItem = {
  parameters?: Array<Derefable<OpenApiParameter>>;
} & Partial<Record<(typeof HTTP_METHOD_KEYS)[number], OpenApiOperation>>;

interface OpenApiServerVariable {
  default?: string;
}

interface OpenApiServer {
  url: string;
  description?: string;
  variables?: Record<string, OpenApiServerVariable>;
}

interface OpenApiSecurityScheme {
  type?: string;
  scheme?: string;
  in?: "header" | "query" | "cookie";
  name?: string;
}

interface OpenApiDocument {
  openapi: string;
  info?: { title?: string };
  paths?: Record<string, OpenApiPathItem>;
  servers?: OpenApiServer[];
  security?: Array<Record<string, string[]>>;
  components?: {
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
}

function isOpenApiDocument(value: unknown): value is OpenApiDocument {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.openapi === "string" && candidate.openapi.startsWith("3.");
}

/** Nunca lança — usado por `detect` e por `parse`. */
function tryParseOpenApiDocument(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    // não é JSON — tenta YAML abaixo.
  }
  try {
    return parseYaml(content);
  } catch {
    return undefined;
  }
}

// ---- Resolução de `$ref` interno ----

function isRef(value: unknown): value is OpenApiRef {
  return (
    typeof value === "object" && value !== null && typeof (value as OpenApiRef).$ref === "string"
  );
}

function resolveJsonPointer(doc: unknown, pointer: string): unknown {
  if (!pointer.startsWith("#/")) return undefined; // só refs internos são suportados
  const segments = pointer
    .slice(2)
    .split("/")
    .map(segment => decodeURIComponent(segment).replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = doc;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Segue uma cadeia de `$ref` (não-schema: parâmetro, request body...); limitada contra ciclo raro fora de schema. */
function deref<T>(value: Derefable<T> | undefined, doc: OpenApiDocument): T | undefined {
  let current: unknown = value;
  let hops = 0;
  while (isRef(current) && hops < 50) {
    current = resolveJsonPointer(doc, current.$ref);
    hops += 1;
  }
  return current as T | undefined;
}

// ---- Geração de exemplo a partir de schema ----

function exampleForStringFormat(format: string | undefined): string {
  switch (format) {
    case "date":
      return "2024-01-01";
    case "date-time":
      return "2024-01-01T00:00:00Z";
    case "email":
      return "user@example.com";
    case "uuid":
      return "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    case "uri":
    case "url":
      return "https://example.com";
    default:
      return "string";
  }
}

function generateExample(
  schemaOrRef: Derefable<OpenApiSchemaObject> | undefined,
  doc: OpenApiDocument,
  visiting: ReadonlySet<string>,
): unknown {
  if (!schemaOrRef) return null;

  let schema: OpenApiSchemaObject | undefined = schemaOrRef as OpenApiSchemaObject;
  let visitingNext = visiting;

  if (isRef(schemaOrRef)) {
    if (visiting.has(schemaOrRef.$ref)) return null; // ciclo — corta em vez de recursionar
    visitingNext = new Set(visiting).add(schemaOrRef.$ref);
    schema = resolveJsonPointer(doc, schemaOrRef.$ref) as OpenApiSchemaObject | undefined;
  }
  if (!schema) return null;

  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  if (schema.allOf) {
    return schema.allOf.reduce<Record<string, unknown>>((acc, sub) => {
      const generated = generateExample(sub, doc, visitingNext);
      return generated && typeof generated === "object" ? { ...acc, ...generated } : acc;
    }, {});
  }
  if (schema.oneOf && schema.oneOf.length > 0)
    return generateExample(schema.oneOf[0], doc, visitingNext);
  if (schema.anyOf && schema.anyOf.length > 0)
    return generateExample(schema.anyOf[0], doc, visitingNext);

  const type = Array.isArray(schema.type)
    ? schema.type.find(candidate => candidate !== "null")
    : schema.type;

  if (type === "object" || (schema.properties && !type)) {
    const result: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
      result[key] = generateExample(propSchema, doc, visitingNext);
    }
    return result;
  }
  if (type === "array")
    return schema.items ? [generateExample(schema.items, doc, visitingNext)] : [];
  if (type === "string") return exampleForStringFormat(schema.format);
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return true;
  return null;
}

function toParamValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ---- Body de exemplo da requisição ----

function buildRequestBody(
  operation: OpenApiOperation,
  doc: OpenApiDocument,
  contextName: string,
  notConverted: ImportReportItem[],
): RequestBody | undefined {
  const requestBody = deref(operation.requestBody, doc);
  const content = requestBody?.content;
  if (!content) return undefined;

  const json = content["application/json"];
  if (json) {
    if (json.example !== undefined)
      return { type: "json", json: JSON.stringify(json.example, null, 2) };
    const firstExample = json.examples ? Object.values(json.examples)[0]?.value : undefined;
    if (firstExample !== undefined)
      return { type: "json", json: JSON.stringify(firstExample, null, 2) };
    const generated = generateExample(json.schema, doc, new Set());
    return { type: "json", json: JSON.stringify(generated, null, 2) };
  }

  const [firstContentType] = Object.keys(content);
  if (firstContentType) {
    notConverted.push({
      path: `body de "${contextName}"`,
      reason: `content-type "${firstContentType}" sem geração automática de exemplo — só application/json é suportado`,
    });
  }
  return undefined;
}

// ---- Parâmetros (path/query/header) ----

function mergeParameters(
  pathLevel: Array<Derefable<OpenApiParameter>> | undefined,
  operationLevel: Array<Derefable<OpenApiParameter>> | undefined,
  doc: OpenApiDocument,
): OpenApiParameter[] {
  const byKey = new Map<string, OpenApiParameter>();
  for (const raw of [...(pathLevel ?? []), ...(operationLevel ?? [])]) {
    const param = deref(raw, doc);
    if (param) byKey.set(`${param.in}:${param.name}`, param);
  }
  return [...byKey.values()];
}

function paramExampleValue(param: OpenApiParameter, doc: OpenApiDocument): string {
  if (param.example !== undefined) return toParamValue(param.example);
  const schema = deref(param.schema, doc);
  if (schema?.example !== undefined) return toParamValue(schema.example);
  return toParamValue(generateExample(param.schema, doc, new Set()));
}

// ---- Auth a partir de `securitySchemes` ----

function mapSecurityScheme(
  schemeName: string,
  scheme: OpenApiSecurityScheme | undefined,
  contextName: string,
  notConverted: ImportReportItem[],
): AuthConfig | undefined {
  if (!scheme) return undefined;

  if (scheme.type === "apiKey") {
    if (scheme.in === "cookie") {
      notConverted.push({
        path: `auth de "${contextName}"`,
        reason: `security scheme "${schemeName}" usa apiKey em cookie — sem equivalente no Wttp, configure manualmente`,
      });
      return undefined;
    }
    return {
      type: "apikey",
      apikey: {
        key: scheme.name ?? "",
        value: `{{${schemeName}}}`,
        in: scheme.in === "query" ? "query" : "header",
      },
    };
  }

  if (scheme.type === "http" && scheme.scheme === "basic") {
    return { type: "basic", basic: { username: "", password: "" } };
  }

  if (scheme.type === "http" && scheme.scheme === "bearer") {
    return { type: "bearer", bearer: { token: `{{${schemeName}}}` } };
  }

  notConverted.push({
    path: `auth de "${contextName}"`,
    reason: `security scheme "${schemeName}" (${scheme.type}) sem equivalente no Wttp — configure manualmente`,
  });
  return undefined;
}

/** Primeiro requirement, primeiro scheme dele — o mesmo formato de auth simples que os outros importadores mapeiam. */
function resolveSecurity(
  requirements: Array<Record<string, string[]>> | undefined,
  schemes: Record<string, OpenApiSecurityScheme> | undefined,
  contextName: string,
  notConverted: ImportReportItem[],
): AuthConfig | undefined {
  if (!requirements) return undefined;
  if (requirements.length === 0) return { type: "none" };

  const [firstRequirement] = requirements;
  const [schemeName] = Object.keys(firstRequirement);
  if (!schemeName) return { type: "none" };

  return mapSecurityScheme(schemeName, schemes?.[schemeName], contextName, notConverted);
}

// ---- Path → `:param`, agrupamento por tag ou primeiro segmento ----

function pathToWttpTemplate(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

function firstPathSegment(path: string): string {
  const segment = path.split("/").find(part => part.length > 0);
  return segment ? segment.replace(/[{}]/g, "") : "root";
}

function operationName(operation: OpenApiOperation, method: string, path: string): string {
  return operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`;
}

function normalizeOperation(
  path: string,
  method: (typeof HTTP_METHOD_KEYS)[number],
  operation: OpenApiOperation,
  pathItem: OpenApiPathItem,
  doc: OpenApiDocument,
  notConverted: ImportReportItem[],
): NormalizedRequest {
  const name = operationName(operation, method, path);
  const params = mergeParameters(pathItem.parameters, operation.parameters, doc);

  const pathParams: KeyValueEntry[] = params
    .filter(param => param.in === "path")
    .map(param => ({ name: param.name, value: paramExampleValue(param, doc), enabled: true }));
  const query: KeyValueEntry[] = params
    .filter(param => param.in === "query")
    .map(param => ({
      name: param.name,
      value: paramExampleValue(param, doc),
      enabled: !!param.required,
    }));
  const headers: KeyValueEntry[] = params
    .filter(param => param.in === "header")
    .map(param => ({
      name: param.name,
      value: paramExampleValue(param, doc),
      enabled: !!param.required,
    }));

  // `security` explícito na operação (mesmo vazio, que significa "sem auth") substitui o
  // requirement global; ausência do campo = herda o auth da collection (undefined).
  const auth =
    operation.security !== undefined
      ? resolveSecurity(operation.security, doc.components?.securitySchemes, name, notConverted)
      : undefined;

  return {
    kind: "request",
    name,
    method: method.toUpperCase() as HttpMethod,
    url: `{{base_url}}${pathToWttpTemplate(path)}`,
    pathParams: pathParams.length > 0 ? pathParams : undefined,
    query: query.length > 0 ? query : undefined,
    headers: headers.length > 0 ? headers : undefined,
    auth,
    body: buildRequestBody(operation, doc, name, notConverted),
    docs: operation.description || undefined,
  };
}

function groupName(operation: OpenApiOperation, path: string): string {
  const [tag] = operation.tags ?? [];
  return tag ?? firstPathSegment(path);
}

function normalizePaths(doc: OpenApiDocument, notConverted: ImportReportItem[]): NormalizedNode[] {
  const groups = new Map<string, NormalizedRequest[]>();

  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHOD_KEYS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const request = normalizeOperation(path, method, operation, pathItem, doc, notConverted);
      const group = groupName(operation, path);
      const bucket = groups.get(group) ?? [];
      bucket.push(request);
      groups.set(group, bucket);
    }
  }

  return [...groups.entries()].map(([name, children]) => ({
    kind: "folder" as const,
    name,
    children,
  }));
}

// ---- `servers[]` → um environment por servidor, variável `base_url` ----

function resolveServerUrl(server: OpenApiServer): string {
  if (!server.variables) return server.url;
  return server.url.replace(
    /\{([^}]+)\}/g,
    (match, name: string) => server.variables?.[name]?.default ?? match,
  );
}

function normalizeServers(servers: OpenApiServer[] | undefined): NormalizedEnvironment[] {
  if (!servers || servers.length === 0) return [];
  return servers.map((server, index) => ({
    name: server.description || `Server ${index + 1}`,
    variables: [{ name: "base_url", value: resolveServerUrl(server), enabled: true }],
  }));
}

function normalizeOpenApi(doc: OpenApiDocument): NormalizedImport {
  const notConverted: ImportReportItem[] = [];
  const name = doc.info?.title || "OpenAPI import";

  const children = normalizePaths(doc, notConverted);
  const environments = normalizeServers(doc.servers);
  const auth = resolveSecurity(doc.security, doc.components?.securitySchemes, name, notConverted);

  return { name, auth, children, environments, notConverted };
}

export const openapiImporter: Importer = {
  format: "openapi",
  detect: content => isOpenApiDocument(tryParseOpenApiDocument(content)),
  parse: content => {
    const doc = tryParseOpenApiDocument(content);
    if (!isOpenApiDocument(doc)) throw new Error("not a recognizable OpenAPI 3.x document");
    return doc;
  },
  normalize: parsed => normalizeOpenApi(parsed as OpenApiDocument),
};

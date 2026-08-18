import { describe, expect, it } from "vitest";

import type { NormalizedFolder, NormalizedRequest } from "./types";

import { openapiImporter } from "./openapi";

function spec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    openapi: "3.0.3",
    info: { title: "Demo API" },
    paths: {},
    ...overrides,
  };
}

function firstRequest(doc: Record<string, unknown>): NormalizedRequest {
  const normalized = openapiImporter.normalize(openapiImporter.parse(JSON.stringify(doc)));
  const [group] = normalized.children as NormalizedFolder[];
  return group.children[0] as NormalizedRequest;
}

describe("openapiImporter.detect", () => {
  it("reconhece OpenAPI 3.0", () => {
    expect(openapiImporter.detect(JSON.stringify(spec()))).toBe(true);
  });

  it("reconhece OpenAPI 3.1", () => {
    expect(openapiImporter.detect(JSON.stringify(spec({ openapi: "3.1.0" })))).toBe(true);
  });

  it("reconhece a mesma spec serializada em YAML", () => {
    const yaml = ["openapi: 3.0.3", "info:", "  title: Demo", "paths: {}"].join("\n");
    expect(openapiImporter.detect(yaml)).toBe(true);
  });

  it("rejeita Swagger 2.0 — fora do escopo desta task", () => {
    expect(openapiImporter.detect(JSON.stringify({ swagger: "2.0", paths: {} }))).toBe(false);
  });

  it("rejeita conteúdo que não é JSON nem YAML válido, sem lançar", () => {
    expect(openapiImporter.detect("curl https://example.com")).toBe(false);
  });
});

describe("openapiImporter.normalize — path e agrupamento", () => {
  it("{param} do path vira :param, compatível com o resolvedor de path params do Wttp", () => {
    const doc = spec({
      paths: {
        "/pets/{petId}/photos/{photoId}": {
          get: {
            operationId: "getPhoto",
            tags: ["pets"],
            parameters: [
              { name: "petId", in: "path", schema: { type: "integer" } },
              { name: "photoId", in: "path", schema: { type: "integer" } },
            ],
          },
        },
      },
    });
    const request = firstRequest(doc);
    expect(request.url).toBe("{{base_url}}/pets/:petId/photos/:photoId");
    expect(request.pathParams).toEqual([
      expect.objectContaining({ name: "petId" }),
      expect.objectContaining({ name: "photoId" }),
    ]);
  });

  it("agrupa por tag quando presente", () => {
    const doc = spec({
      paths: { "/pets": { get: { operationId: "listPets", tags: ["Pets"] } } },
    });
    const normalized = openapiImporter.normalize(openapiImporter.parse(JSON.stringify(doc)));
    const [group] = normalized.children as NormalizedFolder[];
    expect(group.name).toBe("Pets");
  });

  it("sem tag, agrupa pelo primeiro segmento do path", () => {
    const doc = spec({
      paths: { "/pets/{id}": { get: { operationId: "getPet" } } },
    });
    const normalized = openapiImporter.normalize(openapiImporter.parse(JSON.stringify(doc)));
    const [group] = normalized.children as NormalizedFolder[];
    expect(group.name).toBe("pets");
  });

  it("nome da request usa summary, depois operationId, depois método+path", () => {
    const doc = spec({
      paths: {
        "/a": { get: { summary: "List As", operationId: "listA", tags: ["a"] } },
        "/b": { get: { operationId: "listB", tags: ["b"] } },
        "/c": { get: { tags: ["c"] } },
      },
    });
    const normalized = openapiImporter.normalize(openapiImporter.parse(JSON.stringify(doc)));
    const names = (normalized.children as NormalizedFolder[]).map(
      group => (group.children[0] as NormalizedRequest).name,
    );
    expect(names).toEqual(["List As", "listB", "GET /c"]);
  });
});

describe("openapiImporter.normalize — parâmetros", () => {
  it("path-level e operation-level se combinam, operação sobrescreve mesmo nome", () => {
    const doc = spec({
      paths: {
        "/items/{id}": {
          parameters: [{ name: "id", in: "path", schema: { type: "string" }, example: "shared" }],
          get: {
            tags: ["items"],
            parameters: [
              { name: "id", in: "path", example: "overridden" },
              { name: "verbose", in: "query", schema: { type: "boolean" } },
            ],
          },
        },
      },
    });
    const request = firstRequest(doc);
    expect(request.pathParams).toEqual([{ name: "id", value: "overridden", enabled: true }]);
    expect(request.query).toEqual([{ name: "verbose", value: "true", enabled: false }]);
  });
});

describe("openapiImporter.normalize — body de exemplo", () => {
  function bodyOf(schema: unknown): unknown {
    const doc = spec({
      paths: {
        "/items": {
          post: {
            tags: ["items"],
            requestBody: { content: { "application/json": { schema } } },
          },
        },
      },
    });
    const request = firstRequest(doc);
    return request.body;
  }

  it("usa example do content quando presente", () => {
    const doc = spec({
      paths: {
        "/items": {
          post: {
            tags: ["items"],
            requestBody: {
              content: { "application/json": { example: { a: 1 }, schema: { type: "object" } } },
            },
          },
        },
      },
    });
    const request = firstRequest(doc);
    expect(request.body).toEqual({ type: "json", json: JSON.stringify({ a: 1 }, null, 2) });
  });

  it("gera exemplo a partir de object/array/string/integer/boolean quando não há example", () => {
    const body = bodyOf({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
        active: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
      },
    });
    expect(body).toEqual({
      type: "json",
      json: JSON.stringify({ name: "string", age: 0, active: true, tags: ["string"] }, null, 2),
    });
    // o JSON gerado é sempre válido
    expect(() => JSON.parse((body as { json: string }).json)).not.toThrow();
  });

  it("enum usa o primeiro valor", () => {
    const body = bodyOf({ type: "string", enum: ["available", "pending", "sold"] });
    expect(body).toEqual({ type: "json", json: JSON.stringify("available", null, 2) });
  });

  it("resolve $ref de components.schemas", () => {
    const doc = spec({
      paths: {
        "/items": {
          post: {
            tags: ["items"],
            requestBody: {
              content: { "application/json": { schema: { $ref: "#/components/schemas/Item" } } },
            },
          },
        },
      },
      components: {
        schemas: { Item: { type: "object", properties: { id: { type: "integer" } } } },
      },
    });
    const request = firstRequest(doc);
    expect(request.body).toEqual({ type: "json", json: JSON.stringify({ id: 0 }, null, 2) });
  });

  it("$ref circular não trava o importador", () => {
    const doc = spec({
      paths: {
        "/items": {
          post: {
            tags: ["items"],
            requestBody: {
              content: { "application/json": { schema: { $ref: "#/components/schemas/Node" } } },
            },
          },
        },
      },
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: {
              name: { type: "string" },
              children: { type: "array", items: { $ref: "#/components/schemas/Node" } },
            },
          },
        },
      },
    });

    const request = firstRequest(doc);
    expect(request.body).toBeDefined();
    const parsed = JSON.parse((request.body as { json: string }).json);
    expect(parsed).toEqual({ name: "string", children: [null] });
  });

  it("content-type sem application/json entra no relatório, sem body gerado", () => {
    const doc = spec({
      paths: {
        "/items": {
          post: {
            tags: ["items"],
            requestBody: { content: { "application/xml": { schema: { type: "object" } } } },
          },
        },
      },
    });
    const normalized = openapiImporter.normalize(openapiImporter.parse(JSON.stringify(doc)));
    const request = (normalized.children[0] as NormalizedFolder).children[0] as NormalizedRequest;
    expect(request.body).toBeUndefined();
    expect(normalized.notConverted).toContainEqual(
      expect.objectContaining({ reason: expect.stringContaining("application/xml") }),
    );
  });
});

describe("openapiImporter.normalize — servers → environments", () => {
  it("cada servidor vira um environment com base_url", () => {
    const doc = spec({
      servers: [
        { url: "https://api.example.com", description: "Production" },
        { url: "https://staging.example.com", description: "Staging" },
      ],
    });
    const normalized = openapiImporter.normalize(openapiImporter.parse(JSON.stringify(doc)));
    expect(normalized.environments).toEqual([
      {
        name: "Production",
        variables: [{ name: "base_url", value: "https://api.example.com", enabled: true }],
      },
      {
        name: "Staging",
        variables: [{ name: "base_url", value: "https://staging.example.com", enabled: true }],
      },
    ]);
  });

  it("variáveis de servidor são substituídas pelo default", () => {
    const doc = spec({
      servers: [
        {
          url: "https://{host}:{port}/v1",
          variables: { host: { default: "api.example.com" }, port: { default: "443" } },
        },
      ],
    });
    const normalized = openapiImporter.normalize(openapiImporter.parse(JSON.stringify(doc)));
    expect(normalized.environments[0].variables).toEqual([
      { name: "base_url", value: "https://api.example.com:443/v1", enabled: true },
    ]);
  });

  it("sem servers, nenhum environment é criado", () => {
    const normalized = openapiImporter.normalize(openapiImporter.parse(JSON.stringify(spec())));
    expect(normalized.environments).toEqual([]);
  });
});

describe("openapiImporter.normalize — securitySchemes", () => {
  it("apiKey em header converte direto", () => {
    const doc = spec({
      security: [{ api_key: [] }],
      components: {
        securitySchemes: { api_key: { type: "apiKey", name: "X-Api-Key", in: "header" } },
      },
    });
    const normalized = openapiImporter.normalize(openapiImporter.parse(JSON.stringify(doc)));
    expect(normalized.auth).toEqual({
      type: "apikey",
      apikey: { key: "X-Api-Key", value: "{{api_key}}", in: "header" },
    });
  });

  it("http bearer converte direto", () => {
    const doc = spec({
      security: [{ bearerAuth: [] }],
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
    });
    const normalized = openapiImporter.normalize(openapiImporter.parse(JSON.stringify(doc)));
    expect(normalized.auth).toEqual({ type: "bearer", bearer: { token: "{{bearerAuth}}" } });
  });

  it("oauth2 não tem equivalente — vira entrada no relatório", () => {
    const doc = spec({
      security: [{ oauth: [] }],
      components: { securitySchemes: { oauth: { type: "oauth2" } } },
    });
    const normalized = openapiImporter.normalize(openapiImporter.parse(JSON.stringify(doc)));
    expect(normalized.auth).toBeUndefined();
    expect(normalized.notConverted).toContainEqual(
      expect.objectContaining({ reason: expect.stringContaining("oauth2") }),
    );
  });

  it("security por operação sobrescreve a global, inclusive [] explícito virando none", () => {
    const doc = spec({
      security: [{ api_key: [] }],
      components: {
        securitySchemes: { api_key: { type: "apiKey", name: "X-Api-Key", in: "header" } },
      },
      paths: { "/public": { get: { tags: ["public"], security: [] } } },
    });
    const request = firstRequest(doc);
    expect(request.auth).toEqual({ type: "none" });
  });

  it("operação sem campo security herda o auth da collection (undefined = inherit)", () => {
    const doc = spec({
      security: [{ api_key: [] }],
      components: {
        securitySchemes: { api_key: { type: "apiKey", name: "X-Api-Key", in: "header" } },
      },
      paths: { "/inherits": { get: { tags: ["items"] } } },
    });
    const request = firstRequest(doc);
    expect(request.auth).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";

import type { NormalizedFolder, NormalizedRequest } from "./types";

import { postmanImporter } from "./postman";

function collection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    info: {
      name: "Demo",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [],
    ...overrides,
  };
}

describe("postmanImporter.detect", () => {
  it("reconhece uma collection v2.1 pelo schema", () => {
    expect(postmanImporter.detect(JSON.stringify(collection()))).toBe(true);
  });

  it("reconhece um export de environment do Postman", () => {
    const env = { name: "Staging", values: [], _postman_variable_scope: "environment" };
    expect(postmanImporter.detect(JSON.stringify(env))).toBe(true);
  });

  it("rejeita JSON que não é nem collection nem environment do Postman", () => {
    expect(postmanImporter.detect(JSON.stringify({ foo: "bar" }))).toBe(false);
  });

  it("rejeita conteúdo que não é JSON válido, sem lançar", () => {
    expect(postmanImporter.detect("not json")).toBe(false);
  });
});

describe("postmanImporter.normalize — hierarquia", () => {
  it("preserva pastas aninhadas e requests na ordem original", () => {
    const parsed = collection({
      item: [
        {
          name: "Users",
          item: [
            {
              name: "Get user",
              request: { method: "GET", url: "https://api.example.com/users/:id" },
            },
            {
              name: "Nested",
              item: [
                {
                  name: "Deep request",
                  request: { method: "POST", url: "https://api.example.com/deep" },
                },
              ],
            },
          ],
        },
      ],
    });

    const normalized = postmanImporter.normalize(parsed);
    expect(normalized.name).toBe("Demo");
    expect(normalized.children).toHaveLength(1);

    const usersFolder = normalized.children[0] as NormalizedFolder;
    expect(usersFolder.kind).toBe("folder");
    expect(usersFolder.name).toBe("Users");
    expect(usersFolder.children).toHaveLength(2);

    const getUser = usersFolder.children[0] as NormalizedRequest;
    expect(getUser.method).toBe("GET");
    expect(getUser.url).toBe("https://api.example.com/users/:id");

    const nestedFolder = usersFolder.children[1] as NormalizedFolder;
    expect(nestedFolder.kind).toBe("folder");
    const deepRequest = nestedFolder.children[0] as NormalizedRequest;
    expect(deepRequest.name).toBe("Deep request");
  });

  it("extrai query string e path variables da URL", () => {
    const parsed = collection({
      item: [
        {
          name: "Search",
          request: {
            method: "GET",
            url: {
              raw: "https://api.example.com/users/:id?active=true",
              variable: [{ key: "id" }],
            },
          },
        },
      ],
    });

    const [request] = postmanImporter.normalize(parsed).children as NormalizedRequest[];
    expect(request.url).toBe("https://api.example.com/users/:id");
    expect(request.query).toEqual([{ name: "active", value: "true", enabled: true }]);
    expect(request.pathParams).toEqual([{ name: "id", value: "", enabled: true }]);
  });

  it("variáveis de collection viram variables da pasta raiz, não um environment", () => {
    const parsed = collection({
      variable: [{ key: "base_url", value: "https://api.example.com" }],
    });
    const normalized = postmanImporter.normalize(parsed);
    expect(normalized.variables).toEqual([
      { name: "base_url", value: "https://api.example.com", enabled: true },
    ]);
    expect(normalized.environments).toEqual([]);
  });
});

describe("postmanImporter.normalize — auth", () => {
  it("os cinco tipos com equivalente direto convertem sem entrar no relatório", () => {
    const cases: Array<[unknown, unknown]> = [
      [{ type: "noauth" }, { type: "none" }],
      [
        { type: "bearer", bearer: [{ key: "token", value: "abc" }] },
        { type: "bearer", bearer: { token: "abc" } },
      ],
      [
        {
          type: "basic",
          basic: [
            { key: "username", value: "admin" },
            { key: "password", value: "s3cr3t" },
          ],
        },
        { type: "basic", basic: { username: "admin", password: "s3cr3t" } },
      ],
      [
        {
          type: "apikey",
          apikey: [
            { key: "key", value: "X-Api-Key" },
            { key: "value", value: "abc" },
            { key: "in", value: "header" },
          ],
        },
        { type: "apikey", apikey: { key: "X-Api-Key", value: "abc", in: "header" } },
      ],
    ];

    for (const [postmanAuth, expected] of cases) {
      const parsed = collection({
        item: [
          {
            name: "Req",
            request: { method: "GET", url: "https://api.example.com", auth: postmanAuth },
          },
        ],
      });
      const [request] = postmanImporter.normalize(parsed).children as NormalizedRequest[];
      expect(request.auth).toEqual(expected);
    }
  });

  it("tipo sem equivalente (oauth2) vira entrada no relatório em vez de auth quebrada", () => {
    const parsed = collection({
      item: [
        {
          name: "OAuth req",
          request: { method: "GET", url: "https://api.example.com", auth: { type: "oauth2" } },
        },
      ],
    });

    const normalized = postmanImporter.normalize(parsed);
    const [request] = normalized.children as NormalizedRequest[];
    expect(request.auth).toBeUndefined();
    expect(normalized.notConverted).toContainEqual({
      path: 'auth de "OAuth req"',
      reason: 'tipo de auth "oauth2" sem equivalente no Wttp — configure manualmente',
    });
  });
});

describe("postmanImporter.normalize — body", () => {
  function bodyOf(body: unknown, header: unknown[] = []): NormalizedRequest {
    const parsed = collection({
      item: [
        { name: "Req", request: { method: "POST", url: "https://api.example.com", header, body } },
      ],
    });
    const [request] = postmanImporter.normalize(parsed).children as NormalizedRequest[];
    return request;
  }

  it("raw com linguagem json vira body json", () => {
    const request = bodyOf({ mode: "raw", raw: '{"a":1}', options: { raw: { language: "json" } } });
    expect(request.body).toEqual({ type: "json", json: '{"a":1}' });
  });

  it("raw sem linguagem, mas parseável como JSON, também vira json (heurística tipo cURL)", () => {
    const request = bodyOf({ mode: "raw", raw: '{"a":1}' });
    expect(request.body).toEqual({ type: "json", json: '{"a":1}' });
  });

  it("raw de texto simples vira raw com content-type do header", () => {
    const request = bodyOf({ mode: "raw", raw: "plain text" }, [
      { key: "Content-Type", value: "text/plain" },
    ]);
    expect(request.body).toEqual({ type: "raw", raw: "plain text", contentType: "text/plain" });
  });

  it("urlencoded mapeia key/value/disabled", () => {
    const request = bodyOf({
      mode: "urlencoded",
      urlencoded: [
        { key: "a", value: "1" },
        { key: "b", value: "2", disabled: true },
      ],
    });
    expect(request.body).toEqual({
      type: "urlencoded",
      urlencoded: [
        { name: "a", value: "1", enabled: true },
        { name: "b", value: "2", enabled: false },
      ],
    });
  });

  it("formdata com arquivo mapeia src para o campo file", () => {
    const request = bodyOf({
      mode: "formdata",
      formdata: [
        { key: "field", value: "value", type: "text" },
        { key: "avatar", type: "file", src: "/tmp/avatar.png" },
      ],
    });
    expect(request.body).toEqual({
      type: "multipart",
      multipart: [
        { name: "field", type: "text", value: "value", enabled: true },
        { name: "avatar", type: "file", value: "/tmp/avatar.png", enabled: true },
      ],
    });
  });

  it("graphql não tem equivalente — vira raw JSON e entra no relatório", () => {
    const parsed = collection({
      item: [
        {
          name: "GraphQL req",
          request: {
            method: "POST",
            url: "https://api.example.com/graphql",
            body: { mode: "graphql", graphql: { query: "{ me }", variables: "{}" } },
          },
        },
      ],
    });
    const normalized = postmanImporter.normalize(parsed);
    const [request] = normalized.children as NormalizedRequest[];
    expect(request.body).toEqual({
      type: "raw",
      raw: JSON.stringify({ query: "{ me }", variables: {} }, null, 2),
      contentType: "application/json",
    });
    expect(normalized.notConverted).toContainEqual({
      path: 'body de "GraphQL req"',
      reason: "GraphQL não tem tipo de body equivalente — convertido para JSON bruto",
    });
  });
});

describe("postmanImporter.normalize — scripts", () => {
  it("converte chamadas pm.* conhecidas para a API do Wttp", () => {
    const parsed = collection({
      item: [
        {
          name: "Login",
          request: { method: "POST", url: "https://api.example.com/login" },
          event: [
            {
              listen: "prerequest",
              script: { exec: ['pm.environment.set("started_at", Date.now());'] },
            },
            {
              listen: "test",
              script: {
                exec: [
                  'pm.test("status is 200", function () {',
                  "  pm.expect(pm.response.code).to.equal(200);",
                  "});",
                  'pm.environment.set("token", pm.response.json().token);',
                ],
              },
            },
          ],
        },
      ],
    });

    const normalized = postmanImporter.normalize(parsed);
    const [request] = normalized.children as NormalizedRequest[];

    expect(request.scripts?.preRequest).toBe('wttp.setVar("started_at", Date.now());');
    expect(request.scripts?.tests).toBe(
      [
        'test("status is 200", function () {',
        "  expect(res.status).toBe(200);",
        "});",
        'wttp.setVar("token", res.json.token);',
      ].join("\n"),
    );
    expect(normalized.notConverted).toEqual([]);
  });

  it("linha sem conversão automática vira comentário e entra no relatório, nunca é descartada", () => {
    const parsed = collection({
      item: [
        {
          name: "Weird script",
          request: { method: "GET", url: "https://api.example.com" },
          event: [
            {
              listen: "prerequest",
              script: { exec: ["pm.sendRequest('https://example.com', () => {});"] },
            },
          ],
        },
      ],
    });

    const normalized = postmanImporter.normalize(parsed);
    const [request] = normalized.children as NormalizedRequest[];
    expect(request.scripts?.preRequest).toBe("// pm.sendRequest('https://example.com', () => {});");
    expect(normalized.notConverted).toContainEqual({
      path: 'script pre-request de "Weird script"',
      reason:
        "linha sem conversão automática, preservada como comentário: \"pm.sendRequest('https://example.com', () => {});\"",
    });
  });

  it("linhas de JS puro (sem pm.) passam intactas", () => {
    const parsed = collection({
      item: [
        {
          name: "Plain",
          request: { method: "GET", url: "https://api.example.com" },
          event: [
            {
              listen: "prerequest",
              script: { exec: ["const now = Date.now();", "console.log(now);"] },
            },
          ],
        },
      ],
    });

    const [request] = postmanImporter.normalize(parsed).children as NormalizedRequest[];
    expect(request.scripts?.preRequest).toBe("const now = Date.now();\nconsole.log(now);");
  });
});

describe("postmanImporter.normalize — environment", () => {
  it("environment do Postman vira NormalizedEnvironment sem pasta nenhuma", () => {
    const env = {
      name: "Staging",
      _postman_variable_scope: "environment",
      values: [
        { key: "base_url", value: "https://staging.example.com", enabled: true },
        { key: "disabled_var", value: "x", enabled: false },
      ],
    };

    const normalized = postmanImporter.normalize(env);
    expect(normalized.children).toEqual([]);
    expect(normalized.environments).toEqual([
      {
        name: "Staging",
        variables: [
          { name: "base_url", value: "https://staging.example.com", enabled: true },
          { name: "disabled_var", value: "x", enabled: false },
        ],
      },
    ]);
  });
});

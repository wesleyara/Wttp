import { describe, expect, it } from "vitest";

import type { NormalizedFolder, NormalizedRequest } from "./types";

import { insomniaImporter } from "./insomnia";

function exportDoc(resources: Array<Record<string, unknown>>): Record<string, unknown> {
  return { _type: "export", __export_format: 4, resources };
}

const workspace = { _id: "wrk_1", _type: "workspace", parentId: null, name: "Demo" };

describe("insomniaImporter.detect", () => {
  it("reconhece um export v4 em JSON", () => {
    const doc = exportDoc([workspace]);
    expect(insomniaImporter.detect(JSON.stringify(doc))).toBe(true);
  });

  it("reconhece o mesmo export serializado em YAML", () => {
    const yaml = [
      "_type: export",
      "__export_format: 4",
      "resources:",
      "  - _id: wrk_1",
      "    _type: workspace",
      "    parentId: null",
      "    name: Demo",
    ].join("\n");
    expect(insomniaImporter.detect(yaml)).toBe(true);
  });

  it("rejeita JSON que não é um export do Insomnia", () => {
    expect(insomniaImporter.detect(JSON.stringify({ foo: "bar" }))).toBe(false);
  });

  it("rejeita conteúdo que não é JSON nem YAML válido, sem lançar", () => {
    expect(insomniaImporter.detect("curl https://example.com")).toBe(false);
  });

  it("uma URL comum não é confundida com um export do Insomnia", () => {
    expect(insomniaImporter.detect("https://api.example.com/users?id=1")).toBe(false);
  });
});

describe("insomniaImporter.normalize — hierarquia", () => {
  it("resolve request_group aninhado (parentId em cadeia) preservando a ordem por metaSortKey", () => {
    const doc = exportDoc([
      workspace,
      {
        _id: "fld_a",
        _type: "request_group",
        parentId: "wrk_1",
        name: "Users",
        metaSortKey: 1,
      },
      {
        _id: "fld_b",
        _type: "request_group",
        parentId: "fld_a",
        name: "Nested",
        metaSortKey: 2,
      },
      {
        _id: "req_1",
        _type: "request",
        parentId: "fld_a",
        name: "List users",
        method: "GET",
        url: "https://api.example.com/users",
        metaSortKey: 1,
      },
      {
        _id: "req_2",
        _type: "request",
        parentId: "fld_b",
        name: "Deep request",
        method: "POST",
        url: "https://api.example.com/deep",
        metaSortKey: 1,
      },
    ]);

    const normalized = insomniaImporter.normalize(insomniaImporter.parse(JSON.stringify(doc)));
    expect(normalized.name).toBe("Demo");
    expect(normalized.children).toHaveLength(1);

    const usersFolder = normalized.children[0] as NormalizedFolder;
    expect(usersFolder.name).toBe("Users");
    expect(usersFolder.children).toHaveLength(2);
    expect((usersFolder.children[0] as NormalizedRequest).name).toBe("List users");

    const nestedFolder = usersFolder.children[1] as NormalizedFolder;
    expect(nestedFolder.name).toBe("Nested");
    expect((nestedFolder.children[0] as NormalizedRequest).name).toBe("Deep request");
  });

  it("query embutida na URL e parameters estruturados se somam", () => {
    const doc = exportDoc([
      workspace,
      {
        _id: "req_1",
        _type: "request",
        parentId: "wrk_1",
        name: "Search",
        method: "GET",
        url: "https://api.example.com/search?embedded=true",
        parameters: [{ name: "structured", value: "1" }],
      },
    ]);

    const [request] = insomniaImporter.normalize(insomniaImporter.parse(JSON.stringify(doc)))
      .children as NormalizedRequest[];
    expect(request.url).toBe("https://api.example.com/search");
    expect(request.query).toEqual([
      { name: "embedded", value: "true", enabled: true },
      { name: "structured", value: "1", enabled: true },
    ]);
  });
});

describe("insomniaImporter.normalize — auth", () => {
  it("basic e bearer convertem direto", () => {
    const doc = exportDoc([
      workspace,
      {
        _id: "req_1",
        _type: "request",
        parentId: "wrk_1",
        name: "Basic req",
        method: "GET",
        url: "https://api.example.com",
        authentication: { type: "basic", username: "admin", password: "s3cr3t" },
      },
      {
        _id: "req_2",
        _type: "request",
        parentId: "wrk_1",
        name: "Bearer req",
        method: "GET",
        url: "https://api.example.com",
        authentication: { type: "bearer", token: "abc123" },
      },
    ]);

    const [basicReq, bearerReq] = insomniaImporter.normalize(
      insomniaImporter.parse(JSON.stringify(doc)),
    ).children as NormalizedRequest[];
    expect(basicReq.auth).toEqual({
      type: "basic",
      basic: { username: "admin", password: "s3cr3t" },
    });
    expect(bearerReq.auth).toEqual({ type: "bearer", bearer: { token: "abc123" } });
  });

  it("auth desabilitada na origem vira none, não é descartada silenciosamente como se nunca tivesse existido", () => {
    const doc = exportDoc([
      workspace,
      {
        _id: "req_1",
        _type: "request",
        parentId: "wrk_1",
        name: "Disabled auth",
        method: "GET",
        url: "https://api.example.com",
        authentication: { type: "basic", username: "a", password: "b", disabled: true },
      },
    ]);
    const [request] = insomniaImporter.normalize(insomniaImporter.parse(JSON.stringify(doc)))
      .children as NormalizedRequest[];
    expect(request.auth).toEqual({ type: "none" });
  });

  it("tipo sem equivalente (oauth2) vira entrada no relatório", () => {
    const doc = exportDoc([
      workspace,
      {
        _id: "req_1",
        _type: "request",
        parentId: "wrk_1",
        name: "OAuth req",
        method: "GET",
        url: "https://api.example.com",
        authentication: { type: "oauth2" },
      },
    ]);
    const normalized = insomniaImporter.normalize(insomniaImporter.parse(JSON.stringify(doc)));
    const [request] = normalized.children as NormalizedRequest[];
    expect(request.auth).toBeUndefined();
    expect(normalized.notConverted).toContainEqual({
      path: 'auth de "OAuth req"',
      reason: 'tipo de auth "oauth2" sem equivalente no Wttp — configure manualmente',
    });
  });
});

describe("insomniaImporter.normalize — body", () => {
  function bodyOf(body: unknown): NormalizedRequest {
    const doc = exportDoc([
      workspace,
      {
        _id: "req_1",
        _type: "request",
        parentId: "wrk_1",
        name: "Req",
        method: "POST",
        url: "https://api.example.com",
        body,
      },
    ]);
    const [request] = insomniaImporter.normalize(insomniaImporter.parse(JSON.stringify(doc)))
      .children as NormalizedRequest[];
    return request;
  }

  it("application/json mapeia direto para body json", () => {
    const request = bodyOf({ mimeType: "application/json", text: '{"a":1}' });
    expect(request.body).toEqual({ type: "json", json: '{"a":1}' });
  });

  it("urlencoded mapeia params", () => {
    const request = bodyOf({
      mimeType: "application/x-www-form-urlencoded",
      params: [
        { name: "a", value: "1" },
        { name: "b", value: "2", disabled: true },
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

  it("multipart com arquivo de caminho relativo não gera aviso", () => {
    const request = bodyOf({
      mimeType: "multipart/form-data",
      params: [{ name: "avatar", type: "file", fileName: "avatar.png" }],
    });
    expect(request.body).toEqual({
      type: "multipart",
      multipart: [{ name: "avatar", type: "file", value: "avatar.png", enabled: true }],
    });
  });

  it("multipart com arquivo de caminho absoluto da máquina de origem entra no relatório", () => {
    const doc = exportDoc([
      workspace,
      {
        _id: "req_1",
        _type: "request",
        parentId: "wrk_1",
        name: "Upload",
        method: "POST",
        url: "https://api.example.com",
        body: {
          mimeType: "multipart/form-data",
          params: [{ name: "avatar", type: "file", fileName: "/home/dev/avatar.png" }],
        },
      },
    ]);
    const normalized = insomniaImporter.normalize(insomniaImporter.parse(JSON.stringify(doc)));
    expect(normalized.notConverted).toContainEqual({
      path: 'body de "Upload"',
      reason:
        'arquivo com caminho absoluto da máquina de origem ("/home/dev/avatar.png") — ajuste para um caminho relativo ao workspace',
    });
  });

  it("mimeType arbitrário vira raw com o content-type original", () => {
    const request = bodyOf({ mimeType: "application/xml", text: "<a/>" });
    expect(request.body).toEqual({ type: "raw", raw: "<a/>", contentType: "application/xml" });
  });
});

describe("insomniaImporter.normalize — environments com herança", () => {
  it("sub-environment herda do base e sobrescreve as chaves em comum", () => {
    const doc = exportDoc([
      workspace,
      {
        _id: "env_base",
        _type: "environment",
        parentId: "wrk_1",
        name: "Base Environment",
        data: { baseUrl: "http://localhost:3000", postId: 44 },
      },
      {
        _id: "env_prod",
        _type: "environment",
        parentId: "env_base",
        name: "Production",
        data: { baseUrl: "https://api.example.com", token: "abc" },
      },
    ]);

    const normalized = insomniaImporter.normalize(insomniaImporter.parse(JSON.stringify(doc)));
    expect(normalized.environments).toHaveLength(1);
    const [production] = normalized.environments;
    expect(production.name).toBe("Production");
    expect(production.variables).toEqual(
      expect.arrayContaining([
        { name: "baseUrl", value: "https://api.example.com", enabled: true, secret: undefined },
        { name: "postId", value: "44", enabled: true, secret: undefined },
        { name: "token", value: "abc", enabled: true, secret: true },
      ]),
    );
    expect(normalized.notConverted).toContainEqual({
      path: 'variável "token" em "Production"',
      reason:
        "nome sugere segredo — marcada secret: true; confirme o valor no environment depois de importar",
    });
  });

  it("environment sem sub-environment (folha única) também é emitido", () => {
    const doc = exportDoc([
      workspace,
      {
        _id: "env_only",
        _type: "environment",
        parentId: "wrk_1",
        name: "Default",
        data: { baseUrl: "http://localhost:3000" },
      },
    ]);
    const normalized = insomniaImporter.normalize(insomniaImporter.parse(JSON.stringify(doc)));
    expect(normalized.environments).toEqual([
      {
        name: "Default",
        variables: [
          { name: "baseUrl", value: "http://localhost:3000", enabled: true, secret: undefined },
        ],
      },
    ]);
  });
});

describe("insomniaImporter.normalize — sem equivalente", () => {
  it("template tag do Insomnia é preservado no valor e entra no relatório", () => {
    const doc = exportDoc([
      workspace,
      {
        _id: "req_1",
        _type: "request",
        parentId: "wrk_1",
        name: "Templated",
        method: "GET",
        url: "https://api.example.com/{% now 'YYYY' %}",
      },
    ]);
    const normalized = insomniaImporter.normalize(insomniaImporter.parse(JSON.stringify(doc)));
    const [request] = normalized.children as NormalizedRequest[];
    expect(request.url).toBe("https://api.example.com/{% now 'YYYY' %}");
    expect(normalized.notConverted).toContainEqual({
      path: 'url de "Templated"',
      reason: `template tag do Insomnia sem equivalente, valor mantido como está: "https://api.example.com/{% now 'YYYY' %}"`,
    });
  });

  it("script pre-request/post-response do Insomnia entra no relatório em vez de ser descartado", () => {
    const doc = exportDoc([
      workspace,
      {
        _id: "req_1",
        _type: "request",
        parentId: "wrk_1",
        name: "Scripted",
        method: "GET",
        url: "https://api.example.com",
        preRequestScript: "insomnia.request.headers.set('X-Foo', 'bar');",
      },
    ]);
    const normalized = insomniaImporter.normalize(insomniaImporter.parse(JSON.stringify(doc)));
    expect(normalized.notConverted).toContainEqual({
      path: 'scripts de "Scripted"',
      reason:
        "scripts do Insomnia (insomnia.*) não são convertidos — copie manualmente para pre-request/tests",
    });
  });

  it("cookie jar com cookies entra no relatório", () => {
    const doc = exportDoc([
      workspace,
      {
        _id: "jar_1",
        _type: "cookie_jar",
        parentId: "wrk_1",
        name: "Default Jar",
        cookies: [{ key: "session" }],
      },
    ]);
    const normalized = insomniaImporter.normalize(insomniaImporter.parse(JSON.stringify(doc)));
    expect(normalized.notConverted).toContainEqual({
      path: 'cookie jar "Default Jar"',
      reason: "cookies não são suportados pelo Wttp — configure manualmente se necessário",
    });
  });
});

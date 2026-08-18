import type { KeyValueEntry } from "@shared";

import { describe, expect, it } from "vitest";

import {
  resolveRequest,
  type ResolveRequestInput,
  resolveText,
  type VariableScope,
} from "./resolver";

const entry = (name: string, value: string, enabled = true): KeyValueEntry => ({
  name,
  value,
  enabled,
});

describe("precedência", () => {
  it("runtime vence environment, collection, workspace e dinâmicas", () => {
    const scope: VariableScope = {
      runtime: { base_url: "runtime" },
      environment: [entry("base_url", "environment")],
      collection: [entry("base_url", "collection")],
      workspace: [entry("base_url", "workspace")],
    };
    expect(resolveText("{{base_url}}", scope).value).toBe("runtime");
  });

  it("environment vence collection e workspace quando não há runtime", () => {
    const scope: VariableScope = {
      environment: [entry("base_url", "environment")],
      collection: [entry("base_url", "collection")],
      workspace: [entry("base_url", "workspace")],
    };
    expect(resolveText("{{base_url}}", scope).value).toBe("environment");
  });

  it("collection/pasta vence workspace quando não há runtime nem environment", () => {
    const scope: VariableScope = {
      collection: [entry("base_url", "collection")],
      workspace: [entry("base_url", "workspace")],
    };
    expect(resolveText("{{base_url}}", scope).value).toBe("collection");
  });

  it("workspace vence dinâmicas — uma variável de usuário chamada $uuid nunca gera um novo valor", () => {
    const scope: VariableScope = { workspace: [entry("$uuid", "fixed")] };
    expect(resolveText("{{$uuid}}", scope).value).toBe("fixed");
  });

  it("dinâmicas resolvem quando nenhuma das quatro camadas de usuário define o nome", () => {
    const result = resolveText("{{$randomInt}}", {});
    expect(result.unresolved).toEqual([]);
    expect(Number(result.value)).toBeGreaterThanOrEqual(0);
    expect(Number(result.value)).toBeLessThanOrEqual(1000);
  });

  it("entradas desabilitadas (enabled: false) não participam da resolução", () => {
    const scope: VariableScope = { environment: [entry("base_url", "environment", false)] };
    const result = resolveText("{{base_url}}", scope);
    expect(result.value).toBe("{{base_url}}");
    expect(result.unresolved).toEqual(["base_url"]);
  });
});

describe("recursão e ciclos", () => {
  it("uma variável pode referenciar outra", () => {
    const scope: VariableScope = {
      workspace: [entry("host", "api.example.com"), entry("base_url", "https://{{host}}")],
    };
    expect(resolveText("{{base_url}}/users", scope).value).toBe("https://api.example.com/users");
  });

  it("ciclo a → b → a é detectado e reportado com o caminho envolvido, sem estourar a pilha", () => {
    const scope: VariableScope = {
      workspace: [entry("a", "{{b}}"), entry("b", "{{a}}")],
    };
    const result = resolveText("{{a}}", scope);
    expect(result.value).toBe("{{a}}");
    expect(result.unresolved).toContain("a");
    expect(result.cycles.length).toBeGreaterThan(0);
    expect(result.cycles[0]).toEqual(["a", "b", "a"]);
  });
});

describe("variáveis dinâmicas", () => {
  it("$uuid gera um valor novo a cada chamada de resolução", () => {
    const a = resolveText("{{$uuid}}", {}).value;
    const b = resolveText("{{$uuid}}", {}).value;
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("$timestamp e $isoTimestamp resolvem para épocas plausíveis", () => {
    const timestamp = resolveText("{{$timestamp}}", {}).value;
    expect(Number(timestamp)).toBeGreaterThan(1_600_000_000);

    const iso = resolveText("{{$isoTimestamp}}", {}).value;
    expect(() => new Date(iso).toISOString()).not.toThrow();
  });

  it("$uuid referenciado duas vezes na mesma request mantém o mesmo valor", () => {
    const result = resolveRequest(
      {
        url: "https://api.example.com/{{$uuid}}",
        query: [],
        headers: [entry("X-Request-Id", "{{$uuid}}")],
        auth: { type: "none" },
        body: { type: "none" },
      },
      {},
    );
    const idFromUrl = result.url.split("/").pop();
    expect(result.headers[0].value).toBe(idFromUrl);
  });
});

describe("variável não resolvida", () => {
  it("não vira string vazia — o placeholder original é preservado", () => {
    const result = resolveText("Bearer {{access_token}}", {});
    expect(result.value).toBe("Bearer {{access_token}}");
    expect(result.unresolved).toEqual(["access_token"]);
  });
});

describe("escape", () => {
  it("\\{{literal}} produz chaves literais, sem tratar como variável", () => {
    const result = resolveText("\\{{literal}}", { workspace: [entry("literal", "nope")] });
    expect(result.value).toBe("{{literal}}");
    expect(result.unresolved).toEqual([]);
    expect(result.used).toEqual([]);
  });
});

describe("origem reportada (used) — para tooltip EP-06-T05", () => {
  it("relata a camada de onde o valor veio", () => {
    const result = resolveText("{{base_url}}", { environment: [entry("base_url", "https://dev")] });
    expect(result.used).toEqual([
      { name: "base_url", value: "https://dev", source: "environment" },
    ]);
  });
});

describe("resolveRequest — aplicado a URL, query, headers, body e auth", () => {
  const scope: VariableScope = {
    environment: [entry("base_url", "https://api.example.com"), entry("token", "secret-token")],
  };

  it("resolve a URL", () => {
    expect(resolveRequest(baseInput(), scope).url).toBe("https://api.example.com/users");
  });

  it("resolve query e headers", () => {
    const result = resolveRequest(
      {
        ...baseInput(),
        query: [entry("token", "{{token}}")],
        headers: [entry("Authorization", "Bearer {{token}}")],
      },
      scope,
    );
    expect(result.query[0].value).toBe("secret-token");
    expect(result.headers[0].value).toBe("Bearer secret-token");
  });

  it("substitui :nome pelo pathParam habilitado correspondente, resolvendo {{var}} dentro dele", () => {
    const result = resolveRequest(
      { ...baseInput(), url: "{{base_url}}/users/:id", pathParams: [entry("id", "{{token}}")] },
      scope,
    );
    expect(result.url).toBe("https://api.example.com/users/secret-token");
  });

  it(":nome sem pathParam correspondente fica intacto na URL", () => {
    const result = resolveRequest(
      { ...baseInput(), url: "{{base_url}}/users/:id", pathParams: [] },
      scope,
    );
    expect(result.url).toBe("https://api.example.com/users/:id");
  });

  it("pathParam desabilitado não substitui o segmento", () => {
    const result = resolveRequest(
      {
        ...baseInput(),
        url: "{{base_url}}/users/:id",
        pathParams: [entry("id", "42", false)],
      },
      scope,
    );
    expect(result.url).toBe("https://api.example.com/users/:id");
  });

  it("url-encoda o valor do pathParam", () => {
    const result = resolveRequest(
      { ...baseInput(), url: "{{base_url}}/search/:term", pathParams: [entry("term", "a b/c")] },
      scope,
    );
    expect(result.url).toBe("https://api.example.com/search/a%20b%2Fc");
  });

  it("resolve auth bearer/basic/apikey", () => {
    expect(
      resolveRequest(
        { ...baseInput(), auth: { type: "bearer", bearer: { token: "{{token}}" } } },
        scope,
      ).auth,
    ).toEqual({ type: "bearer", bearer: { token: "secret-token" } });

    expect(
      resolveRequest(
        {
          ...baseInput(),
          auth: { type: "basic", basic: { username: "{{token}}", password: "pw" } },
        },
        scope,
      ).auth,
    ).toEqual({ type: "basic", basic: { username: "secret-token", password: "pw" } });

    expect(
      resolveRequest(
        {
          ...baseInput(),
          auth: { type: "apikey", apikey: { key: "X-Api-Key", value: "{{token}}", in: "header" } },
        },
        scope,
      ).auth,
    ).toEqual({
      type: "apikey",
      apikey: { key: "X-Api-Key", value: "secret-token", in: "header" },
    });
  });

  it("resolve body json/urlencoded/raw/multipart/binary", () => {
    expect(
      resolveRequest({ ...baseInput(), body: { type: "json", json: '{"t":"{{token}}"}' } }, scope)
        .body,
    ).toEqual({ type: "json", json: '{"t":"secret-token"}' });

    expect(
      resolveRequest(
        { ...baseInput(), body: { type: "urlencoded", urlencoded: [entry("token", "{{token}}")] } },
        scope,
      ).body,
    ).toEqual({ type: "urlencoded", urlencoded: [entry("token", "secret-token")] });

    expect(
      resolveRequest(
        { ...baseInput(), body: { type: "raw", raw: "{{token}}", contentType: "text/plain" } },
        scope,
      ).body,
    ).toEqual({ type: "raw", raw: "secret-token", contentType: "text/plain" });

    expect(
      resolveRequest(
        {
          ...baseInput(),
          body: {
            type: "multipart",
            multipart: [{ name: "title", type: "text", value: "{{token}}", enabled: true }],
          },
        },
        scope,
      ).body,
    ).toEqual({
      type: "multipart",
      multipart: [{ name: "title", type: "text", value: "secret-token", enabled: true }],
    });

    expect(
      resolveRequest({ ...baseInput(), body: { type: "binary", binary: "./{{token}}.bin" } }, scope)
        .body,
    ).toEqual({ type: "binary", binary: "./secret-token.bin" });
  });

  it("agrega unresolved de todos os campos", () => {
    const result = resolveRequest(
      {
        url: "{{base_url}}/{{missing_a}}",
        query: [entry("q", "{{missing_b}}")],
        headers: [],
        auth: { type: "none" },
        body: { type: "none" },
      },
      scope,
    );
    expect(result.unresolved.sort()).toEqual(["missing_a", "missing_b"]);
  });
});

function baseInput(): ResolveRequestInput {
  return {
    url: "{{base_url}}/users",
    query: [],
    headers: [],
    auth: { type: "none" as const },
    body: { type: "none" as const },
  };
}

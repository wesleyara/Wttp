import { describe, expect, it } from "vitest";

import {
  curlImporter,
  looksLikeCurlCommand,
  parseCurlCommand,
  parseCurlToRequest,
  tokenizeShellCommand,
} from "./curl";

describe("looksLikeCurlCommand", () => {
  it("reconhece um comando cURL", () => {
    expect(looksLikeCurlCommand("curl https://example.com")).toBe(true);
    expect(looksLikeCurlCommand("  curl 'https://example.com'")).toBe(true);
  });

  it("uma URL normal continua se comportando como URL, não como cURL", () => {
    expect(looksLikeCurlCommand("https://example.com/users?id=1")).toBe(false);
    expect(looksLikeCurlCommand("api.example.com/curly-thing")).toBe(false);
  });
});

describe("tokenizeShellCommand", () => {
  it("respeita aspas simples e duplas, inclusive aninhadas", () => {
    const tokens = tokenizeShellCommand(`curl 'https://x' -H "Authorization: Bearer 'abc'"`);
    expect(tokens).toEqual(["curl", "https://x", "-H", "Authorization: Bearer 'abc'"]);
  });

  it("resolve escapes dentro de aspas duplas", () => {
    const tokens = tokenizeShellCommand(String.raw`curl -d "{\"a\":\"b\"}"`);
    expect(tokens).toEqual(["curl", "-d", '{"a":"b"}']);
  });

  it("junta continuação de linha com \\ antes de tokenizar", () => {
    const command = [
      "curl 'https://example.com/users' \\",
      "  -H 'Accept: application/json' \\",
      "  -X POST",
    ].join("\n");
    const tokens = tokenizeShellCommand(command);
    expect(tokens).toEqual([
      "curl",
      "https://example.com/users",
      "-H",
      "Accept: application/json",
      "-X",
      "POST",
    ]);
  });
});

describe("parseCurlCommand", () => {
  it("importa um comando copiado do DevTools do Chrome", () => {
    const command = [
      `curl 'https://api.example.com/v1/users?active=true' \\`,
      `  -H 'accept: application/json' \\`,
      `  -H 'authorization: Bearer secret-token' \\`,
      `  -H 'content-type: application/json' \\`,
      `  --data-raw '{"name":"Ada"}' \\`,
      `  --compressed`,
    ].join("\n");

    const parsed = parseCurlCommand(command);

    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("https://api.example.com/v1/users");
    expect(parsed.query).toEqual([{ name: "active", value: "true", enabled: true }]);
    expect(parsed.headers).toEqual([
      { name: "accept", value: "application/json", enabled: true },
      { name: "authorization", value: "Bearer secret-token", enabled: true },
      { name: "content-type", value: "application/json", enabled: true },
    ]);
    expect(parsed.body).toEqual({ type: "json", json: '{"name":"Ada"}' });
    expect(parsed.notConverted).toEqual([]);
  });

  it("aspas aninhadas e continuação de linha combinadas não quebram o parser", () => {
    const command = [
      `curl 'https://api.example.com/search' \\`,
      `  -H "X-Query: \\"quoted value\\"" \\`,
      `  -X GET`,
    ].join("\n");

    const parsed = parseCurlCommand(command);
    expect(parsed.url).toBe("https://api.example.com/search");
    expect(parsed.headers).toEqual([{ name: "X-Query", value: '"quoted value"', enabled: true }]);
    expect(parsed.method).toBe("GET");
  });

  it("-X define o método explicitamente", () => {
    const parsed = parseCurlCommand("curl -X DELETE https://api.example.com/users/1");
    expect(parsed.method).toBe("DELETE");
  });

  it("-d sem content-type explícito vira urlencoded", () => {
    const parsed = parseCurlCommand("curl -d 'a=1&b=2' https://api.example.com/form");
    expect(parsed.method).toBe("POST");
    expect(parsed.body).toEqual({
      type: "urlencoded",
      urlencoded: [
        { name: "a", value: "1", enabled: true },
        { name: "b", value: "2", enabled: true },
      ],
    });
  });

  it("--data-urlencode url-encoda o valor mantendo o nome", () => {
    const parsed = parseCurlCommand(
      `curl --data-urlencode 'q=hello world' https://api.example.com/search`,
    );
    expect(parsed.body).toEqual({
      type: "urlencoded",
      urlencoded: [{ name: "q", value: "hello world", enabled: true }],
    });
  });

  it("-F monta multipart, arquivo reconhecido pelo prefixo @", () => {
    const parsed = parseCurlCommand(
      `curl -F 'field=value' -F 'file=@photo.png;type=image/png' https://api.example.com/upload`,
    );
    expect(parsed.method).toBe("POST");
    expect(parsed.body).toEqual({
      type: "multipart",
      multipart: [
        { name: "field", type: "text", value: "value", enabled: true },
        { name: "file", type: "file", value: "photo.png", enabled: true },
      ],
    });
  });

  it("-u vira auth básica", () => {
    const parsed = parseCurlCommand("curl -u admin:s3cr3t https://api.example.com/secure");
    expect(parsed.auth).toEqual({
      type: "basic",
      basic: { username: "admin", password: "s3cr3t" },
    });
  });

  it("-k desativa validação de TLS", () => {
    const parsed = parseCurlCommand("curl -k https://self-signed.example.com");
    expect(parsed.settings).toEqual({ validateTls: false, followRedirects: undefined });
  });

  it("flag desconhecida vira entrada no relatório em vez de travar o parser", () => {
    const parsed = parseCurlCommand("curl --unknown-flag https://api.example.com");
    expect(parsed.url).toBe("https://api.example.com");
    expect(parsed.notConverted).toContainEqual({
      path: 'flag "--unknown-flag"',
      reason: "flag não suportada — ignorada",
    });
  });

  it("sem body nem -X, o método é GET", () => {
    const parsed = parseCurlCommand("curl https://api.example.com/users");
    expect(parsed.method).toBe("GET");
    expect(parsed.body).toBeUndefined();
  });
});

describe("parseCurlToRequest", () => {
  it("devolve null quando o conteúdo não parece um cURL", () => {
    expect(parseCurlToRequest("https://api.example.com/users")).toBeNull();
  });

  it("devolve a request parseada quando o conteúdo é um cURL", () => {
    const result = parseCurlToRequest("curl https://api.example.com/users");
    expect(result?.method).toBe("GET");
    expect(result?.url).toBe("https://api.example.com/users");
  });
});

describe("curlImporter (contrato Importer)", () => {
  it("normaliza um único request a partir do comando parseado", () => {
    const parsed = parseCurlCommand("curl -X POST https://api.example.com/users -d 'a=1'");
    const normalized = curlImporter.normalize(parsed);

    expect(normalized.children).toHaveLength(1);
    const [request] = normalized.children;
    expect(request.kind).toBe("request");
    if (request.kind === "request") {
      expect(request.method).toBe("POST");
      expect(request.url).toBe("https://api.example.com/users");
    }
    expect(normalized.environments).toEqual([]);
  });
});

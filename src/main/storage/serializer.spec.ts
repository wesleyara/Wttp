import { describe, expect, it } from "vitest";

import { parseRequest } from "./parser";
import { serializeEnvironment, serializeRequest } from "./serializer";

const baseRequest = {
  wttp: 1 as const,
  name: "Req",
  seq: 1,
  method: "GET" as const,
  url: "{{base_url}}/x",
};

describe("variantes de body", () => {
  it("urlencoded", () => {
    const yaml = serializeRequest({
      ...baseRequest,
      body: {
        type: "urlencoded",
        urlencoded: [{ name: "grant_type", value: "password", enabled: true }],
      },
    });
    expect(yaml).toContain(
      "body:\n  type: urlencoded\n  urlencoded:\n    - { name: grant_type, value: password, enabled: true }\n",
    );
  });

  it("multipart", () => {
    const yaml = serializeRequest({
      ...baseRequest,
      body: {
        type: "multipart",
        multipart: [
          { name: "file", type: "file", value: "./fixtures/avatar.png", enabled: true },
          { name: "title", type: "text", value: "Avatar", enabled: true },
        ],
      },
    });
    expect(yaml).toContain(
      "  multipart:\n" +
        "    - { name: file, type: file, value: ./fixtures/avatar.png, enabled: true }\n" +
        "    - { name: title, type: text, value: Avatar, enabled: true }\n",
    );
  });

  it("raw preserva a ordem type, contentType, raw", () => {
    const yaml = serializeRequest({
      ...baseRequest,
      body: { type: "raw", contentType: "text/xml", raw: "<request><id>1</id></request>\n" },
    });
    expect(yaml).toContain(
      "body:\n  type: raw\n  contentType: text/xml\n  raw: |\n    <request><id>1</id></request>\n",
    );
  });

  it("binary", () => {
    const yaml = serializeRequest({
      ...baseRequest,
      body: { type: "binary", binary: "./fixtures/payload.bin" },
    });
    expect(yaml).toContain("body:\n  type: binary\n  binary: ./fixtures/payload.bin\n");
  });
});

describe("variantes de auth", () => {
  it("bearer", () => {
    const yaml = serializeRequest({
      ...baseRequest,
      auth: { type: "bearer", bearer: { token: "{{access_token}}" } },
    });
    expect(yaml).toContain('auth:\n  type: bearer\n  bearer:\n    token: "{{access_token}}"\n');
  });

  it("apikey", () => {
    const yaml = serializeRequest({
      ...baseRequest,
      auth: { type: "apikey", apikey: { key: "X-Api-Key", value: "{{api_key}}", in: "header" } },
    });
    expect(yaml).toContain(
      'auth:\n  type: apikey\n  apikey:\n    key: X-Api-Key\n    value: "{{api_key}}"\n    in: header\n',
    );
  });
});

describe("segredos", () => {
  it("nunca gravam o valor real no YAML, mesmo que o objeto em memória o carregue", () => {
    const yaml = serializeEnvironment({
      wttp: 1,
      name: "prod",
      variables: [{ name: "api_key", value: "sk-live-do-not-leak", enabled: true, secret: true }],
    });

    expect(yaml).not.toContain("sk-live-do-not-leak");
    expect(yaml).toContain('{ name: api_key, value: "", enabled: true, secret: true }');
  });
});

describe("parser", () => {
  it("trata query, headers, body e auth ausentes como undefined, não como array/objeto vazio", () => {
    const parsed = parseRequest("wttp: 1\nname: Minimal\nseq: 1\nmethod: GET\nurl: /ping\n");
    expect(parsed.query).toBeUndefined();
    expect(parsed.headers).toBeUndefined();
    expect(parsed.body).toBeUndefined();
    expect(parsed.auth).toBeUndefined();
  });
});

describe("docs (EP-12-T01)", () => {
  const markdown =
    '# Login\n\nReturns a token for `{{user}}`.\n\n| field | type |\n| ----- | ---- |\n| user  | string |\n\n```json\n{ "ok": true }\n```\n';

  it("grava o markdown como bloco literal legível e faz round-trip exato", () => {
    const yaml = serializeRequest({ ...baseRequest, docs: markdown });

    expect(yaml).toContain("docs: |\n  # Login\n");
    expect(yaml).toContain("  | field | type |\n");
    expect(yaml).toContain('  { "ok": true }\n');
    expect(parseRequest(yaml).docs).toBe(markdown);
    expect(serializeRequest(parseRequest(yaml))).toBe(yaml);
  });
});

describe("request WebSocket (#476)", () => {
  const wsRequest = {
    ...baseRequest,
    protocol: "websocket" as const,
    url: "wss://{{host}}/chat",
    websocket: {
      // Ordem de entrada propositalmente fora da canônica: a saída segue o fieldOrder.
      message: { content: '{ "type": "ping" }\n', format: "json" as const },
      reconnect: { delayMs: 1000, maxAttempts: 5, enabled: true },
      subprotocols: ["chat", "superchat"],
    },
  };

  it("grava protocol e o bloco websocket na ordem canônica, e faz round-trip exato", () => {
    const yaml = serializeRequest(wsRequest);

    expect(yaml).toBe(
      [
        "wttp: 1",
        "name: Req",
        "seq: 1",
        "protocol: websocket",
        "method: GET",
        "url: wss://{{host}}/chat",
        "websocket:",
        "  subprotocols:",
        "    - chat",
        "    - superchat",
        "  reconnect:",
        "    enabled: true",
        "    maxAttempts: 5",
        "    delayMs: 1000",
        "  message:",
        "    format: json",
        "    content: |",
        '      { "type": "ping" }',
        "",
      ].join("\n"),
    );
    expect(parseRequest(yaml).websocket).toEqual(wsRequest.websocket);
    expect(serializeRequest(parseRequest(yaml))).toBe(yaml);
  });

  it("request HTTP continua sem protocol nem websocket no arquivo", () => {
    const yaml = serializeRequest(baseRequest);
    expect(yaml).not.toContain("protocol");
    expect(yaml).not.toContain("websocket");
  });

  it("preserva campos desconhecidos dentro do arquivo", () => {
    const yaml = `${serializeRequest(wsRequest)}future: 1\n`;
    expect(serializeRequest(parseRequest(yaml))).toBe(yaml);
  });
});

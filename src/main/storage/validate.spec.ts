import { describe, expect, it } from "vitest";

import {
  formatSchemaIssue,
  validateEnvironment,
  validateFolder,
  validateRequest,
  validateWorkspace,
} from "./validate";

const VALID_REQUEST = [
  "wttp: 1",
  "name: List users",
  "seq: 1",
  "method: GET",
  "url: /users",
  "",
].join("\n");

describe("YAML sintaticamente quebrado", () => {
  it("não lança exceção — vira issue com linha", () => {
    const broken = "wttp: 1\nname: [unterminated\n";
    expect(() => validateRequest(broken)).not.toThrow();

    const result = validateRequest(broken);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues[0].line).toBeTypeOf("number");
    }
  });

  it("nível raiz que não é um mapa também não lança", () => {
    expect(() => validateRequest("- just\n- a\n- list\n")).not.toThrow();
    const result = validateRequest("- just\n- a\n- list\n");
    expect(result.valid).toBe(false);
  });
});

describe("campo com tipo errado aponta arquivo e linha", () => {
  it("method inválido", () => {
    const raw = ["wttp: 1", "name: List users", "seq: 1", "method: GETT", "url: /users", ""].join(
      "\n",
    );
    const result = validateRequest(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;

    const issue = result.issues.find(i => i.path === "method");
    expect(issue).toBeDefined();
    expect(issue?.message).toBe('"method" deve ser um método HTTP válido (recebido: "GETT")');
    expect(issue?.line).toBe(4);

    expect(formatSchemaIssue("users/list-users.req.yaml", issue!)).toBe(
      'users/list-users.req.yaml:4\n  SCHEMA_INVALID — "method" deve ser um método HTTP válido (recebido: "GETT")',
    );
  });

  it("seq numérico recebendo string", () => {
    const raw = [
      "wttp: 1",
      "name: List users",
      'seq: "one"',
      "method: GET",
      "url: /users",
      "",
    ].join("\n");
    const result = validateRequest(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.issues.some(i => i.path === "seq")).toBe(true);
  });

  it("campo obrigatório ausente", () => {
    const raw = ["wttp: 1", "seq: 1", "method: GET", "url: /users", ""].join("\n");
    const result = validateRequest(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.issues.some(i => i.path === "name" && i.message === '"name" é obrigatório')).toBe(
      true,
    );
  });
});

describe("arquivo válido", () => {
  it("não gera issues e devolve o valor parseado", () => {
    const result = validateRequest(VALID_REQUEST);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.name).toBe("List users");
    expect(result.value.method).toBe("GET");
  });

  it("wttp ausente não é erro — vira versão 1 com aviso", () => {
    const raw = ["name: List users", "seq: 1", "method: GET", "url: /users", ""].join("\n");
    const result = validateRequest(raw);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.warnings).toEqual([expect.stringContaining('"wttp" ausente')]);
  });

  it("wttp presente não gera aviso", () => {
    const result = validateRequest(VALID_REQUEST);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.warnings).toBeUndefined();
  });
});

describe("versão de schema", () => {
  it("versão futura recusa abrir, com mensagem explícita", () => {
    const raw = ["wttp: 99", "name: List users", "seq: 1", "method: GET", "url: /users", ""].join(
      "\n",
    );
    const result = validateRequest(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    const issue = result.issues.find(i => i.path === "wttp");
    expect(issue?.message).toContain("versão 99");
    expect(issue?.message.toLowerCase()).toContain("atualize o wttp");
  });
});

describe("nenhuma exceção não tratada escapa da camada de storage", () => {
  const inputs = [
    "",
    "\t\tnot: valid: yaml: at: all",
    "wttp: [1, 2\n",
    "null",
    "42",
    '"just a string"',
  ];

  it.each(inputs)("input %j nunca lança para nenhum tipo de arquivo", input => {
    expect(() => validateWorkspace(input)).not.toThrow();
    expect(() => validateFolder(input)).not.toThrow();
    expect(() => validateRequest(input)).not.toThrow();
    expect(() => validateEnvironment(input)).not.toThrow();
  });
});

describe("aninhamento — auth e body", () => {
  it("auth bearer sem token", () => {
    const raw = [
      "wttp: 1",
      "name: List users",
      "seq: 1",
      "method: GET",
      "url: /users",
      "auth:",
      "  type: bearer",
      "",
    ].join("\n");
    const result = validateRequest(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.issues.some(i => i.path === "auth.bearer.token")).toBe(true);
  });

  it("body multipart com item faltando campo obrigatório", () => {
    const raw = [
      "wttp: 1",
      "name: Upload",
      "seq: 1",
      "method: POST",
      "url: /upload",
      "body:",
      "  type: multipart",
      "  multipart:",
      "    - { name: file, type: file, value: ./x.png }",
      "",
    ].join("\n");
    const result = validateRequest(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.issues.some(i => i.path === "body.multipart.0.enabled")).toBe(true);
  });
});

describe("workspace / folder / environment", () => {
  it("workspace válido", () => {
    const raw = ["wttp: 1", "name: My API", ""].join("\n");
    expect(validateWorkspace(raw).valid).toBe(true);
  });

  it("workspace com settings.timeout de tipo errado", () => {
    const raw = ["wttp: 1", "name: My API", "settings:", "  timeout: soon", ""].join("\n");
    const result = validateWorkspace(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.issues.some(i => i.path === "settings.timeout")).toBe(true);
  });

  it("folder válido", () => {
    const raw = ["wttp: 1", "name: Auth", "seq: 1", ""].join("\n");
    expect(validateFolder(raw).valid).toBe(true);
  });

  it("environment com variável secreta sem enabled", () => {
    const raw = [
      "wttp: 1",
      "name: dev",
      "variables:",
      '  - { name: api_key, value: "", secret: true }',
      "",
    ].join("\n");
    const result = validateEnvironment(raw);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.issues.some(i => i.path === "variables.0.enabled")).toBe(true);
  });
});

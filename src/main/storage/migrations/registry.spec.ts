import { describe, expect, it } from "vitest";

import { DomainError } from "../../ipc/errors";
import { CURRENT_SCHEMA_VERSION, migrateToCurrent, resolveSchemaVersion } from "./registry";

describe("resolveSchemaVersion", () => {
  it("wttp ausente vira versão 1 com aviso", () => {
    const result = resolveSchemaVersion({ name: "My API" });
    expect(result).toEqual({ version: 1, warning: expect.any(String) as unknown as string });
  });

  it("wttp presente não gera aviso", () => {
    const result = resolveSchemaVersion({ wttp: 1, name: "My API" });
    expect(result).toEqual({ version: 1 });
  });

  it("wttp de tipo errado vira NaN, sem aviso — cabe ao checker de tipo sinalizar", () => {
    const result = resolveSchemaVersion({ wttp: "one" });
    expect(Number.isNaN(result.version)).toBe(true);
    expect(result.warning).toBeUndefined();
  });
});

describe("migrateToCurrent", () => {
  it("versão já atual passa direto, só garantindo wttp no valor final", () => {
    const migrated = migrateToCurrent({ name: "My API" }, CURRENT_SCHEMA_VERSION);
    expect(migrated).toEqual({ name: "My API", wttp: CURRENT_SCHEMA_VERSION });
  });

  it("versão maior que a suportada recusa abrir, nunca adivinha", () => {
    expect(() => migrateToCurrent({ wttp: 99 }, 99)).toThrow(DomainError);
    try {
      migrateToCurrent({ wttp: 99 }, 99);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("SCHEMA_VERSION_UNSUPPORTED");
      expect((error as DomainError).message).toContain("versão 99");
    }
  });

  it("versão menor sem migrador registrado no caminho recusa em vez de adivinhar", () => {
    // MIGRATIONS está vazio hoje (só existe a versão 1) — uma versão abaixo da atual
    // não tem, por definição, um migrador cadastrado para o salto. Simula esse caso
    // com uma "versão 0" hipotética para exercitar o laço de encadeamento em vez de só
    // o guard inicial (`fromVersion > CURRENT_SCHEMA_VERSION`).
    expect(() => migrateToCurrent({}, 0)).toThrow(DomainError);
    try {
      migrateToCurrent({}, 0);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("SCHEMA_VERSION_UNSUPPORTED");
      expect((error as DomainError).message).toContain("nenhum migrador registrado");
    }
  });
});

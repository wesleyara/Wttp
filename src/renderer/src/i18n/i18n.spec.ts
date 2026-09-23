import { describe, expect, it } from "vitest";

import { en } from "./en";
import { ptBR } from "./pt-BR";

function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

describe("locales", () => {
  const enKeys = flatten(en);
  const ptKeys = flatten(ptBR);

  it("pt-BR cobre exatamente as mesmas chaves de en", () => {
    expect(Object.keys(ptKeys).sort()).toEqual(Object.keys(enKeys).sort());
  });

  it("nenhuma tradução é vazia e os placeholders {x} batem com o en", () => {
    const placeholders = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(enKeys)) {
      expect(ptKeys[key].trim(), key).not.toBe("");
      expect(placeholders(ptKeys[key]), key).toEqual(placeholders(enKeys[key]));
    }
  });
});

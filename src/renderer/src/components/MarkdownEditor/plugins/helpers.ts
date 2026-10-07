import type { InsertGenerator } from "../models/markdown-toolbar.models";

/** Insere `before + (seleção ou placeholder) + after` e deixa o miolo selecionado. */
export function wrap(before: string, after: string, placeholder: string): InsertGenerator {
  return selected => {
    const text = selected || placeholder;
    return {
      targetValue: `${before}${text}${after}`,
      select: true,
      deviationStart: before.length,
      deviationEnd: -after.length,
    };
  };
}

/** Insere um texto fixo, sem seleção (cursor no fim). */
export function text(value: string): InsertGenerator {
  return () => ({ targetValue: value });
}

/** Garante que um bloco comece numa linha própria. */
export function block(value: string): string {
  return `\n${value}\n`;
}

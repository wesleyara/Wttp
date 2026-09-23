/**
 * Executor isolado de JavaScript de usuário (EP-09-T01) — arch-docs/architecture.md §5.
 *
 * Roda dentro do utility process (`worker.ts`), nunca no main. `node:vm` sozinho não é
 * uma fronteira de segurança perfeita — um script hostil ainda pode tentar escapar do
 * contexto por truques de protótipo. O isolamento real vem daqui rodar num processo à
 * parte, sem privilégios, spawnado e morto pelo `runner.ts` (arch-docs/architecture.md §5).
 * Este módulo não importa nada além de `node:vm`, o que o mantém testável com Vitest
 * puro, sem subir o Electron.
 */

import vm from "node:vm";

export interface SandboxRunInput {
  code: string;
  /**
   * Globals explicitamente expostos ao script — nunca `require`, `process`, `module`
   * ou qualquer coisa de `node:*`/`electron`. Quem monta este objeto (`api.ts`) decide
   * a superfície; este módulo só executa contra o que recebeu.
   */
  globals: Record<string, unknown>;
  timeoutMs: number;
}

export type SandboxRunResult = { ok: true } | { ok: false; message: string };

const TIMEOUT_MESSAGE = /script execution timed out/i;

/**
 * Contextifica `input.globals` **no próprio objeto recebido**, sem cópia — quem chama
 * (`api.ts`) mantém a mesma referência e lê de volta o que o script mutou ou
 * reatribuiu (`req = {...}` no topo do script escreve através do contexto até o objeto
 * original, não só numa cópia descartada).
 */
export function runInSandbox(input: SandboxRunInput): SandboxRunResult {
  const context = vm.createContext(input.globals);

  try {
    const script = new vm.Script(input.code, { filename: "script.js" });
    script.runInContext(context, { timeout: input.timeoutMs });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (TIMEOUT_MESSAGE.test(message)) {
      return { ok: false, message: `Script exceeded ${input.timeoutMs}ms timeout` };
    }
    return { ok: false, message };
  }
}

import { DEFAULT_ACCELERATORS } from "../menu";
import { registerHandler } from "./registry";

/** Só devolve a tabela de `menu.ts` — nenhuma regra de negócio, a UI de Shortcuts decide o resto. */
export function registerMenuHandlers(): void {
  registerHandler("menu:getDefaultAccelerators", () => DEFAULT_ACCELERATORS);
}

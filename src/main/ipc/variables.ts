import { resolveAuthChain } from "../http/authInheritance";
import { resolveRequest, resolveText } from "../http/resolver";
import { registerHandler } from "./registry";

/** Expõe o resolvedor puro (EP-06-T01) ao renderer — `resolver.ts` não importa `node:*`/`electron`, mas mora em `main/`, então cruza o IPC como qualquer outra função de domínio. */
export function registerVariableHandlers(): void {
  registerHandler("variables:resolveText", payload => resolveText(payload.text, payload.scope));

  registerHandler("variables:resolveRequest", payload =>
    resolveRequest(payload.request, payload.scope),
  );

  // Herança de auth (EP-07-T01) — mesmo tratamento de `resolveAuthChain`, só puro e
  // testável em `main/http`, exposto ao renderer para a Aba Auth mostrar de onde vem
  // a auth efetiva sem duplicar a lógica de "primeira camada não-inherit vence".
  registerHandler("variables:resolveAuthChain", payload => resolveAuthChain(payload.chain));
}

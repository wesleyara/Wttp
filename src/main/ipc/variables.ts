import { resolveRequest, resolveText } from "../http/resolver";
import { registerHandler } from "./registry";

/** Expõe o resolvedor puro (EP-06-T01) ao renderer — `resolver.ts` não importa `node:*`/`electron`, mas mora em `main/`, então cruza o IPC como qualquer outra função de domínio. */
export function registerVariableHandlers(): void {
  registerHandler("variables:resolveText", payload => resolveText(payload.text, payload.scope));

  registerHandler("variables:resolveRequest", payload =>
    resolveRequest(payload.request, payload.scope),
  );
}

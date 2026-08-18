/**
 * Herança de `auth` (EP-07-T01) — docs/file-format.md §4.
 *
 * Módulo puro, sem `node:*`/`electron`: recebe a cadeia já montada por quem chama (a
 * request e a sequência de pastas até a raiz da collection, pasta mais próxima
 * primeiro) e decide qual `AuthConfig` efetivamente se aplica. Espelha o desenho do
 * resolvedor de variáveis (`resolver.ts`): a primeira camada que não seja `inherit`
 * vence, mesmo que uma camada mais distante também tenha auth configurada.
 *
 * `undefined` num elo da cadeia (pasta sem `folder.yaml`, ou com `folder.yaml` mas sem
 * campo `auth`) se comporta como `inherit` — continua subindo. Chegar ao topo sem
 * achar nada concreto resolve em `{ type: "none" }`: nenhuma auth em lugar nenhum é uma
 * request sem header, não um erro (critério de aceite de EP-07-T01).
 */

import type { AuthConfig } from "@shared";

export interface AuthChainResolution {
  /** Nunca `"inherit"` — ou um tipo concreto, ou `"none"` quando a cadeia inteira herda. */
  auth: AuthConfig;
  /** Índice na cadeia de entrada que forneceu `auth`; `null` quando nada a interrompeu. */
  sourceIndex: number | null;
}

export function resolveAuthChain(chain: (AuthConfig | undefined)[]): AuthChainResolution {
  for (let index = 0; index < chain.length; index++) {
    const auth = chain[index];
    if (!auth || auth.type === "inherit") continue;
    return { auth, sourceIndex: index };
  }
  return { auth: { type: "none" }, sourceIndex: null };
}

/**
 * Ordem de execução dos scripts pre-request e tests (EP-09-T03) — arch-docs/architecture.md
 * §4/§5. Pura: só monta a lista, não chama IPC — quem chama `window.wttp.script.run`
 * é a store (`requestTabs.ts`), que já é o único ponto de I/O do domínio.
 */

import type { FolderNode, RequestScripts } from "@shared";

export interface ScriptChainLink {
  /** Nome exibido no console de scripts e nas mensagens de erro (EP-09-T05). */
  source: string;
  scripts: RequestScripts | undefined;
}

/**
 * Cadeia da request até a raiz da collection, pasta mais próxima primeiro —
 * `folders` já vem nessa ordem (mesma de `useVariablesStore.folderChain`, usada por
 * `authChain`/`collectionScope`).
 */
export function buildScriptChain(
  ownScripts: RequestScripts | undefined,
  folders: FolderNode[],
  ownLabel = "This request",
): ScriptChainLink[] {
  return [
    { source: ownLabel, scripts: ownScripts },
    ...folders.map(folder => ({ source: folder.name, scripts: folder.data?.scripts })),
  ];
}

/**
 * Ordem de execução por fase (arch-docs/backlog/EP-09-scripts.md, EP-09-T03): pre-request
 * roda de fora para dentro — collection/pasta mais distante primeiro, request por
 * último, logo antes do envio. tests roda o inverso — request primeiro, subindo até a
 * collection — porque é a request que sabe o que checar primeiro, a pasta só
 * complementa (ex.: "sem erro 5xx" genérico da collection inteira).
 */
export function orderForPhase(
  chain: ScriptChainLink[],
  phase: "preRequest" | "tests",
): ScriptChainLink[] {
  return phase === "preRequest" ? [...chain].reverse() : chain;
}

/** Só os elos que de fato têm código não vazio para a fase — pula os outros sem gastar uma chamada IPC. */
export function linksWithCode(
  chain: ScriptChainLink[],
  phase: "preRequest" | "tests",
): { source: string; code: string }[] {
  return chain
    .map(link => ({ source: link.source, code: link.scripts?.[phase]?.trim() ?? "" }))
    .filter(link => link.code.length > 0);
}

/**
 * Plano de execução do Collection Runner (EP-13-T01): quais requests rodam, em que
 * ordem, e a cadeia de pastas de cada uma (auth herdada, variáveis de collection e
 * scripts de pasta dependem dela). Puro — recebe a árvore já lida.
 */

import type { FolderNode, RequestNode, WorkspaceNode, WorkspaceTree } from "@shared";

import { DomainError } from "../ipc/errors";

export interface PlannedRequest {
  node: RequestNode & { data: NonNullable<RequestNode["data"]> };
  /** Pastas da request até a raiz da collection, a mais próxima primeiro — mesma ordem de `useVariablesStore.folderChain`. */
  folders: FolderNode[];
}

function findFolder(nodes: WorkspaceNode[], path: string): FolderNode | null {
  for (const node of nodes) {
    if (node.kind !== "folder") continue;
    if (node.path === path) return node;
    if (path.startsWith(`${node.path}/`)) return findFolder(node.children, path);
  }
  return null;
}

/** Request em `path` e sua cadeia de pastas — `null` se não existe ou está inválida (sem `data`). */
export function findRequest(tree: WorkspaceTree, path: string): PlannedRequest | null {
  const chain: FolderNode[] = [];
  let siblings = tree.children;
  for (;;) {
    const request = siblings.find(
      (node): node is RequestNode => node.kind === "request" && node.path === path,
    );
    if (request) {
      return request.data
        ? { node: request as PlannedRequest["node"], folders: chain.reverse() }
        : null;
    }
    const folder = siblings.find(
      (node): node is FolderNode => node.kind === "folder" && path.startsWith(`${node.path}/`),
    );
    if (!folder) return null;
    chain.push(folder);
    siblings = folder.children;
  }
}

function collect(nodes: WorkspaceNode[], chain: FolderNode[], out: PlannedRequest[]): void {
  for (const node of nodes) {
    if (node.kind === "request") {
      // Request com YAML inválido (sem `data`) não tem o que rodar — fica de fora, como a
      // árvore já a mostra com aviso.
      if (node.data)
        out.push({ node: node as PlannedRequest["node"], folders: [...chain].reverse() });
    } else {
      collect(node.children, [...chain, node], out);
    }
  }
}

/** Todas as requests sob `targetPath`, na ordem da árvore (`seq`, profundidade primeiro). */
export function planFolder(tree: WorkspaceTree, targetPath: string): PlannedRequest[] {
  const out: PlannedRequest[] = [];
  if (targetPath === "") {
    collect(tree.children, [], out);
    return out;
  }
  const folder = findFolder(tree.children, targetPath);
  if (!folder) throw new DomainError("ENOENT", `folder not found: "${targetPath}"`, targetPath);

  // Cadeia até a pasta-alvo (inclusive), para as requests herdarem auth/variáveis/scripts
  // das pastas acima dela também, não só das que estão dentro do alvo.
  const ancestors: FolderNode[] = [];
  let siblings = tree.children;
  for (;;) {
    const next = siblings.find(
      (node): node is FolderNode =>
        node.kind === "folder" &&
        (node.path === targetPath || targetPath.startsWith(`${node.path}/`)),
    );
    if (!next) break;
    ancestors.push(next);
    if (next.path === targetPath) break;
    siblings = next.children;
  }
  collect(folder.children, ancestors, out);
  return out;
}

/**
 * Plano final: a seleção da tela do runner (ordem e requests escolhidas), ou a pasta
 * inteira. Cada path da seleção precisa existir e estar dentro de `targetPath` — o
 * renderer não é confiável e o runner nunca roda algo fora do alvo pedido.
 */
export function buildPlan(
  tree: WorkspaceTree,
  targetPath: string,
  selection?: string[],
): PlannedRequest[] {
  if (!selection) return planFolder(tree, targetPath);
  const prefix = targetPath === "" ? "" : `${targetPath}/`;
  return selection.map(path => {
    if (!path.startsWith(prefix)) {
      throw new DomainError("INVALID_PAYLOAD", `request outside the run target: "${path}"`, path);
    }
    const found = findRequest(tree, path);
    if (!found) throw new DomainError("ENOENT", `request not found: "${path}"`, path);
    return found;
  });
}

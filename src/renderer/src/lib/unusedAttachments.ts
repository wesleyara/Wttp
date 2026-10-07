/**
 * Anexos não usados (EP-12): um arquivo de `attachments/` que nenhum `docs` cita mais. A
 * conta é feita em cima de **texto**, não de sintaxe de imagem — qualquer menção a
 * `attachments/<arquivo>` (imagem, link, até dentro de bloco de código) conta como uso. Errar
 * para o lado de "ainda está em uso" só deixa um arquivo órfão a mais; errar para o outro lado
 * mandaria para a lixeira algo que a documentação ainda mostra.
 */

import type { AttachmentInfo, WorkspaceNode } from "@shared";

const MENTION = /attachments\/[^\s)"'\]<>]+/gi;

/** Caminhos de anexo mencionados em qualquer um dos textos (em minúsculas, para comparar com o disco). */
export function referencedAttachments(texts: string[]): Set<string> {
  const referenced = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(MENTION)) referenced.add(match[0].toLowerCase());
  }
  return referenced;
}

export function findUnusedAttachments(all: AttachmentInfo[], texts: string[]): AttachmentInfo[] {
  const referenced = referencedAttachments(texts);
  return all.filter(info => !referenced.has(info.path.toLowerCase()));
}

/** Todos os `docs` do workspace salvo em disco: raiz da árvore, pastas e requests. */
export function docsInTree(nodes: WorkspaceNode[]): string[] {
  const docs: string[] = [];
  const visit = (list: WorkspaceNode[]): void => {
    for (const node of list) {
      const own = node.data?.docs;
      if (own) docs.push(own);
      if (node.kind === "folder") visit(node.children);
    }
  };
  visit(nodes);
  return docs;
}

/**
 * Git no Wttp (ClickLocal #51 em diante): vocabulário entre `src/main/git` (a CLI `git` do
 * sistema) e o renderer. Todos os caminhos são relativos à raiz do **workspace**, com `/`
 * — mesmo formato dos `path` de nó da árvore —, mesmo quando o repositório é maior que ele.
 */

export type GitFileStatus = "modified" | "added" | "deleted" | "untracked" | "conflicted";

export interface GitFileChange {
  /** Relativo à raiz do workspace. */
  path: string;
  status: GitFileStatus;
  /** Há mudança na index (staged) — base do stage/unstage do card #53. */
  staged: boolean;
  /** Há mudança no working tree ainda não staged (inclui arquivo untracked). */
  unstaged: boolean;
  /** Caminho anterior de um rename/cópia, quando também está dentro do workspace. */
  from?: string;
}

export interface GitRepositoryInfo {
  /** Raiz do repositório (absoluta) — pode ser uma pasta acima do workspace. */
  root: string;
  /** Pasta do workspace relativa à raiz do repositório — `""` quando são a mesma. */
  workspacePath: string;
  /** Branch atual; `null` com HEAD destacado. */
  branch: string | null;
  detached: boolean;
  /** Hash curto do HEAD; `null` num repositório sem nenhum commit ainda. */
  head: string | null;
}

export interface GitInfo {
  /** `git` encontrado no PATH. */
  available: boolean;
  /** `null` quando o workspace não está dentro de um repositório (ou sem `git`). */
  repository: GitRepositoryInfo | null;
}

export interface GitStatus extends GitInfo {
  /** Mudanças dentro do workspace (`.wttp/` nunca entra). Vazio fora de um repositório. */
  files: GitFileChange[];
}

export interface GitRootPayload {
  /** Raiz do workspace aberto. */
  root: string;
}

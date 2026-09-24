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

/** Base de comparação da aba Changes (#52): `HEAD`, uma branch, tag ou commit. */
export interface GitRef {
  name: string;
  kind: "branch" | "remote" | "tag";
  /** A branch em que o HEAD está. */
  current?: boolean;
}

export interface GitChangesPayload extends GitRootPayload {
  /** `HEAD` (padrão), branch, tag ou hash — nunca começa com `-`. */
  base?: string;
}

export interface GitFileVersionsPayload extends GitRootPayload {
  /** Relativo ao workspace. */
  path: string;
  /** Onde o arquivo estava na base, se foi renomeado. */
  from?: string;
  base?: string;
}

export interface GitPathsPayload extends GitRootPayload {
  /** Relativos ao workspace. */
  paths: string[];
}

export interface GitCommitPayload extends GitRootPayload {
  message: string;
}

export interface GitCommitResult {
  /** Hash curto do commit criado. */
  hash: string;
}

export interface GitBranches {
  repository: GitRepositoryInfo;
  /** Branches locais e remotas (sem tags). */
  refs: GitRef[];
  /** Arquivos com mudança fora do workspace (relativos à raiz do repo) — no máximo 20. */
  outsideChanges: string[];
  outsideChangesCount: number;
}

export interface GitCheckoutPayload extends GitRootPayload {
  /** Branch local, ou remota (`origin/x`) com `track: true`. */
  name: string;
  /** Branch remota: cria a local de mesmo nome acompanhando ela ("checkout as local"). */
  track?: boolean;
}

export interface GitCreateBranchPayload extends GitRootPayload {
  name: string;
}

export type GitFileKind = "request" | "folder" | "environment" | "workspace" | "text";

/** Um lado do diff: o texto cru e, quando o YAML parseia, os dados do arquivo. */
export interface GitFileVersion {
  text: string;
  /** `RequestFile`/`FolderFile`/`EnvironmentFile`/`WorkspaceFile`, conforme `kind`. */
  data?: unknown;
  /** O YAML não passou no parser/validador — a UI cai para o diff de texto. */
  invalid?: boolean;
}

export interface GitFileVersions {
  kind: GitFileKind;
  /** `null` = o arquivo não existe na base (novo). */
  before: GitFileVersion | null;
  /** `null` = o arquivo não existe mais no disco (apagado). */
  after: GitFileVersion | null;
}

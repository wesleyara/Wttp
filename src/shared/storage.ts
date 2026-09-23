/**
 * Tipos dos arquivos YAML de workspace (EP-04), espelhando arch-docs/file-format.md.
 * Reaproveita o vocabulário de `http.ts` (`KeyValueEntry`, `AuthConfig`, `RequestBody`,
 * `HttpMethod`) porque é o mesmo formato de request usado pela engine, só que ainda com
 * `{{variáveis}}` não resolvidas.
 */

import type {
  AuthConfig,
  HttpMethod,
  HttpRequestSettings,
  KeyValueEntry,
  RequestBody,
} from "./http";

/** Versão do schema em disco — arch-docs/file-format.md §6, regra 1. */
export type SchemaVersion = 1;

/**
 * Chaves que esta versão do app não reconhece, capturadas na leitura e regravadas tal
 * qual — arch-docs/file-format.md §6, regra 7. Nunca populado por código próprio do Wttp.
 */
export interface UnknownFields {
  unknown?: Record<string, unknown>;
}

export interface WorkspaceSettings {
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  validateTls?: boolean;
  scriptTimeout?: number;
}

/** `wttp.yaml` — manifesto do workspace. */
export interface WorkspaceFile extends UnknownFields {
  wttp: SchemaVersion;
  name: string;
  description?: string;
  defaultEnvironment?: string;
  settings?: WorkspaceSettings;
  variables?: KeyValueEntry[];
}

/** `folder.yaml` — pasta / collection. Opcional em disco. */
export interface RequestScripts {
  preRequest?: string;
  tests?: string;
}

export interface FolderFile extends UnknownFields {
  wttp: SchemaVersion;
  name: string;
  seq: number;
  auth?: AuthConfig;
  /** Variáveis de collection/pasta (EP-06) — nível "collection/pasta" da precedência do resolvedor. */
  variables?: KeyValueEntry[];
  /** Herdados por toda request abaixo (EP-09-T03) — pasta mais próxima primeiro no pre-request, ordem inversa nos tests. */
  scripts?: RequestScripts;
  docs?: string;
}

/** `*.req.yaml` — uma request. */
export interface RequestFile extends UnknownFields {
  wttp: SchemaVersion;
  name: string;
  seq: number;
  method: HttpMethod;
  url: string;
  /** Valor de cada segmento `:nome` na URL — substituídos antes da resolução de `{{var}}` (EP-06.1). */
  pathParams?: KeyValueEntry[];
  query?: KeyValueEntry[];
  headers?: KeyValueEntry[];
  auth?: AuthConfig;
  body?: RequestBody;
  settings?: HttpRequestSettings;
  scripts?: RequestScripts;
  docs?: string;
}

/** Variável de environment — `secret: true` nunca carrega valor real em disco. */
export interface EnvironmentVariable extends KeyValueEntry {
  secret?: boolean;
}

/** `environments/*.yaml`. */
export interface EnvironmentFile extends UnknownFields {
  wttp: SchemaVersion;
  name: string;
  variables?: EnvironmentVariable[];
}

/**
 * Um environment lido do disco, com o nome do arquivo em `environments/` (EP-06-T02) —
 * mesmo par `path`/`data` de `FolderNode`/`RequestNode`. `path` é fixado na criação e
 * não muda quando `data.name` é editado depois (evita ter que migrar as chaves de
 * segredo no keychain, que usam `path` como o segmento `<env>` — arch-docs/file-format.md §5).
 */
export interface EnvironmentListItem {
  path: string;
  data: EnvironmentFile;
}

/**
 * Árvore de um workspace lida do disco (EP-04-T04) — o que `workspace:open` e
 * `workspace:create` devolvem ao renderer. Espelha o layout de diretórios de
 * arch-docs/file-format.md §1, não a hierarquia de `import`/`export` do resto do app.
 */

/** Localização de um problema de schema num nó da árvore — ver `SchemaIssue` no main. */
export interface WorkspaceNodeIssue {
  /** Caminho pontuado até o campo problemático, relativo ao próprio arquivo do nó. */
  path: string;
  message: string;
  /** 1-indexed. Ausente quando o problema não é localizável num campo do arquivo. */
  line?: number;
}

/**
 * Uma pasta/collection. `path` é o diretório, relativo à raiz do workspace ("" para a
 * raiz). `data` é `null` quando não existe `folder.yaml` (pasta "nua", válida) **ou**
 * quando existe mas é inválido — nesse segundo caso `issues` vem preenchido e a pasta
 * continua navegável, com seus filhos, arch-docs/file-format.md §7.
 */
export interface FolderNode {
  kind: "folder";
  path: string;
  /** `data.name` quando presente e válido; senão o nome do diretório. */
  name: string;
  /** `data.seq` quando presente e válido; senão um valor alto, para ordenar por último. */
  seq: number;
  data: FolderFile | null;
  issues?: WorkspaceNodeIssue[];
  children: WorkspaceNode[];
}

/** Uma request. `data` é `null` quando o arquivo é inválido — ver `FolderNode`. */
export interface RequestNode {
  kind: "request";
  /** Caminho do arquivo `*.req.yaml`, relativo à raiz do workspace. */
  path: string;
  name: string;
  seq: number;
  data: RequestFile | null;
  issues?: WorkspaceNodeIssue[];
}

export type WorkspaceNode = FolderNode | RequestNode;

/** Árvore completa de um workspace — devolvida por `workspace:open`/`workspace:create`. */
export interface WorkspaceTree {
  /** Caminho absoluto da raiz do workspace na máquina do usuário. */
  root: string;
  data: WorkspaceFile | null;
  issues?: WorkspaceNodeIssue[];
  environments: EnvironmentFile[];
  children: WorkspaceNode[];
}

/** Entrada da lista de workspaces recentes (`workspace:recent`), fora do YAML. */
export interface RecentWorkspace {
  path: string;
  name: string;
  /** ISO 8601, última vez que este workspace foi aberto ou criado. */
  lastOpened: string;
  /**
   * Computado a cada `workspace:recent` (checa `fs.access`), nunca persistido em
   * `recent-workspaces.json` — uma entrada apontando para uma pasta removida é
   * sinalizada, não some silenciosamente (EP-05-T01).
   */
  missing?: boolean;
}

/**
 * Uma aba de request aberta, dentro de `.wttp/ui-state.json` (EP-05-T05). `pinned:
 * false` = aba de preview (itálico, substituída pela próxima aberta em preview).
 */
export interface TabState {
  path: string;
  pinned: boolean;
  /** `"folder"` = aba de settings de pasta/collection (EP-07.1). Ausente/`"request"` = aba de request, como sempre foi — arquivos antigos sem o campo continuam carregando como request. */
  kind?: "request" | "folder";
}

/**
 * Estado de UI por workspace (arch-docs/file-format.md §1), gitignored em
 * `.wttp/ui-state.json` — não confundir com `UiState` de `shared/ipc.ts`, que é
 * global ao app (tamanhos de painel, sobrevive entre workspaces diferentes).
 */
export interface WorkspaceUiState {
  /** Caminhos de pasta expandidos no `WTree` (EP-05-T02). */
  expandedPaths: string[];
  /** Abas de request abertas, na ordem exibida (EP-05-T05). */
  openTabs: TabState[];
  activeTabPath: string | null;
  /** `path` do environment ativo (EP-06-T04) — `null` = "No environment". */
  activeEnvironment: string | null;
}

/**
 * Rascunho de uma aba suja (EP-08.1-T01), em `.wttp/drafts.json` — o `RequestFile`/
 * `FolderFile` com as edições ainda não salvas, para sobreviver ao fechamento do app
 * mesmo quando `patchUiState`/`restoreSession` só têm o YAML salvo em disco. Chaveado
 * por `path` da aba, mesmo `path` de `TabState`.
 */
export type TabDraft =
  { kind: "request"; data: RequestFile } | { kind: "folder"; data: FolderFile };

/** `.wttp/drafts.json` inteiro (EP-08.1-T01) — uma entrada por aba suja. */
export type WorkspaceDrafts = Record<string, TabDraft>;

/**
 * Evento `workspace:changed` (EP-04-T05) — main → renderer, fora do `IpcContract` de
 * invoke/result pelo mesmo motivo que `HttpProgressEvent`/`MenuAction`. `changedPaths`
 * são os caminhos (relativos à raiz) que motivaram a reconciliação — quem consome o
 * evento usa isso para saber se algum deles corresponde a uma aba com edições não
 * salvas, antes de trocar a árvore exibida.
 */
export interface WorkspaceChangedEvent {
  tree: WorkspaceTree;
  changedPaths: string[];
}

/**
 * Tipos do pipeline de importação (EP-08) — contrato entre `src/main/importers/` e o
 * IPC `import:detect`/`import:run`. Formato de arquivo (`FolderFile`/`RequestFile`/
 * `EnvironmentFile`) é o alvo da normalização, não algo que este arquivo redefine.
 */

import type {
  AuthConfig,
  HttpMethod,
  HttpRequestSettings,
  KeyValueEntry,
  RequestBody,
} from "./http";

/** Um formato de origem suportado — cada um vira um módulo próprio em `main/importers/`. */
export type ImportFormat = "postman" | "insomnia" | "openapi" | "curl";

/** Um item que não pôde ser convertido — docs/backlog EP-08: "nunca silenciosamente parcial". */
export interface ImportReportItem {
  /** Caminho/nome legível de onde o item veio na origem (ex.: nome da request, do script). */
  path: string;
  reason: string;
}

/** Resultado de `import:run` — o que foi criado e o que precisa de atenção manual. */
export interface ImportReport {
  createdFolders: number;
  createdRequests: number;
  createdEnvironments: number;
  notConverted: ImportReportItem[];
}

export interface DetectImportPayload {
  content: string;
  /** Dica pelo nome do arquivo (extensão), quando disponível — ex.: `.postman_collection.json`. */
  filename?: string;
}

/** Ação escolhida pelo usuário para um nó de `ImportPreview.children` que colide com um nome já existente no destino (EP-08-T07). */
export type ImportConflictAction = "rename" | "replace" | "skip";

/**
 * Resolução de um conflito de nome, por item — nunca uma escolha global para o import
 * inteiro (docs/backlog EP-08-T07). `index` é a posição em `ImportPreview.children`
 * (nível único: um nó sem conflito nunca tem colisão nos seus próprios filhos, porque
 * não há "merge" com uma pasta existente — só renomear/substituir/pular o nó inteiro).
 */
export interface ImportConflictResolution {
  index: number;
  action: ImportConflictAction;
  /** Obrigatório quando `action === "rename"`. */
  newName?: string;
}

export interface RunImportPayload {
  format: ImportFormat;
  content: string;
  root: string;
  /** Pasta do workspace onde a árvore importada é criada — "" para a raiz. */
  targetPath: string;
  /**
   * Presente (mesmo vazio) quando o destino é uma pasta já existente dentro de um
   * workspace aberto (EP-08-T07) — o pipeline então grava `ImportPreview.children`
   * direto em `targetPath`, sem envolvê-los numa pasta-raiz nova, e aplica cada
   * resolução de conflito antes de criar o nó correspondente. Ausente = fluxo de
   * EP-08-T06 (sempre workspace novo, sempre envolvido numa pasta-raiz).
   */
  resolutions?: ImportConflictResolution[];
}

/**
 * Um comando cURL colado direto na barra de URL (EP-08-T05) — não passa pela árvore
 * do workspace, só preenche a aba de request ativa. Campos espelham `RequestFile`,
 * já sem `wttp`/`seq`/`name`/`docs`, que não fazem sentido para um autofill pontual.
 */
export interface ParsedCurlRequest {
  method: HttpMethod;
  url: string;
  query: KeyValueEntry[];
  headers: KeyValueEntry[];
  auth?: AuthConfig;
  body?: RequestBody;
  settings?: HttpRequestSettings;
  notConverted: ImportReportItem[];
}

export interface ParseCurlPayload {
  content: string;
}

/** Payload de `import:preview` (EP-08-T06) — mesma entrada de `import:run`, sem `root`/`targetPath`: nada é gravado. */
export interface PreviewImportPayload {
  format: ImportFormat;
  content: string;
}

/**
 * Um nó da árvore de `ImportPreview` — só o que a UI de preview precisa mostrar
 * (nome, tipo, método). Não é `NormalizedNode` (tipo interno de `main/importers`,
 * carrega `RequestBody`/`AuthConfig` inteiros) porque o preview nunca edita nada, só
 * exibe — nenhum motivo para cruzar o IPC com mais dado do que a UI lê.
 */
export interface ImportPreviewNode {
  kind: "folder" | "request";
  name: string;
  method?: HttpMethod;
  children?: ImportPreviewNode[];
}

export interface ImportPreviewEnvironment {
  name: string;
  variableCount: number;
}

/** Resultado de `import:preview` — a árvore que `import:run` criaria, sem tocar disco. */
export interface ImportPreview {
  name: string;
  children: ImportPreviewNode[];
  environments: ImportPreviewEnvironment[];
  notConverted: ImportReportItem[];
}

/**
 * Tipos do pipeline de importação (EP-08) — contrato entre `src/main/importers/` e o
 * IPC `import:detect`/`import:run`. Formato de arquivo (`FolderFile`/`RequestFile`/
 * `EnvironmentFile`) é o alvo da normalização, não algo que este arquivo redefine.
 */

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

export interface RunImportPayload {
  format: ImportFormat;
  content: string;
  root: string;
  /** Pasta do workspace onde a árvore importada é criada — "" para a raiz. */
  targetPath: string;
}

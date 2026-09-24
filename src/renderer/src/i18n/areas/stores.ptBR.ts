import type { storesEn } from "./stores.en";

export const storesPtBR: typeof storesEn = {
  toast: {
    saved: '"{name}" salvo',
    deleted: '"{name}" excluído',
    discarded: 'Alterações em "{name}" descartadas',
    workspaceVariablesSaved: "Variáveis do workspace salvas",
    requestCreated: "Request criada",
    folderCreated: "Pasta criada",
    collectionCreated: "Collection criada",
    moved: "Movido",
    copied: "Copiado",
    curlImported: "cURL importado",
    curlImportedPartial: "cURL importado — {count} item(ns) não convertido(s)",
    curlImportedNewTab: "Importado do cURL numa request nova — a atual foi mantida",
    curlImportedNewTabPartial:
      "Importado do cURL numa request nova — {count} item(ns) não convertido(s)",
    curlPasteInvalid: "Isso não parece um comando cURL válido — nada foi colado",
    curlCopied: "Copiado como cURL",
    curlCopiedWithSecrets: "Copiado como cURL, com segredos",
    curlCopiedUnresolved: "Copiado como cURL — variáveis não resolvidas ficaram literais: {names}",
    curlCopyFailed: "Não foi possível copiar para a área de transferência",
    preRequestFailed: "Script de pre-request falhou ({source}): {message}",
  },
  update: {
    readyToInstall: "O Wttp {version} está pronto para instalar.",
    updateNow: "Atualizar agora",
  },
  storeErrors: {
    preRequestFailed: "Script de pre-request falhou",
  },
  importReport: {
    title: "Relatório de importação — {name}",
    foldersCreated: "Pastas criadas: {count}",
    requestsCreated: "Requests criadas: {count}",
    environmentsCreated: "Environments criados: {count}",
    allConverted: "Tudo convertido — nada precisa de atenção manual.",
    needAttention: "{count} item(ns) precisam de atenção manual:",
    fallbackName: "workspace",
  },
};

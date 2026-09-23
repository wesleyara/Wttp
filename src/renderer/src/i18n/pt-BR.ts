import type { MessageSchema } from "./en";

import { modalsPtBR } from "./areas/modals.ptBR";
import { requestPtBR } from "./areas/request.ptBR";
import { responsePtBR } from "./areas/response.ptBR";
import { storesPtBR } from "./areas/stores.ptBR";

/**
 * Chaves em português (EP-08.1-T06) — mesma estrutura de `en.ts`, chave a chave;
 * qualquer chave que faltar aqui cai no fallback `en` (`i18n/index.ts`).
 */
export const ptBR: MessageSchema = {
  ...requestPtBR,
  ...responsePtBR,
  ...modalsPtBR,
  ...storesPtBR,
  common: {
    cancel: "Cancelar",
    close: "Fechar",
    delete: "Excluir",
    save: "Salvar",
    create: "Criar",
    remove: "Remover",
  },
  theme: {
    system: "Sistema",
    dark: "Escuro",
    light: "Claro",
  },
  shortcutActions: {
    requestNew: "Nova request",
    requestSave: "Salvar",
    requestSend: "Enviar request",
    tabClose: "Fechar aba",
    tabNext: "Próxima aba",
    searchFocus: "Buscar",
    searchQuickOpen: "Busca rápida",
    preferencesOpen: "Preferências",
  },
  shell: {
    filterPlaceholder: "Filtrar…",
    newTooltip: "Novo…",
    emptyTree: {
      title: "Nenhuma collection ainda",
      description: "Crie sua primeira request.",
      newRequest: "Nova request",
    },
    emptyMain: {
      title: "Nada aberto",
      description: "Selecione ou crie uma request, pasta ou collection.",
    },
    emptyResponse: {
      title: "Nenhuma resposta ainda",
      description: "Envie uma request para ver uma resposta.",
    },
  },
  createMenu: {
    newCollection: "Nova collection",
    newFolder: "Nova pasta",
    newRequest: "Nova request",
    import: "Importar",
  },
  contextMenu: {
    newRequest: "Nova request",
    newFolder: "Nova pasta",
    settings: "Configurações",
    rename: "Renomear",
    duplicate: "Duplicar",
    moveTo: "Mover para…",
    copyTo: "Copiar para…",
    reveal: "Mostrar no gerenciador de arquivos",
    delete: "Excluir",
  },
  dialog: {
    unsavedChanges: {
      title: "Alterações não salvas",
      body: '"{title}" tem alterações não salvas. Salvar antes de fechar?',
      discard: "Descartar",
    },
    unresolvedVariable: {
      title: "Variável não resolvida",
      bodyOne: '"{title}" tem uma variável não resolvida: {names}. Enviar assim mesmo?',
      bodyOther: '"{title}" tem variáveis não resolvidas: {names}. Enviar assim mesmo?',
      sendAnyway: "Enviar assim mesmo",
    },
    deleteConfirm: {
      title: "Excluir",
      body: 'Excluir "{name}"?',
      alsoRemovesOne: "Isso também remove 1 item dentro dela.",
      alsoRemovesOther: "Isso também remove {count} itens dentro dela.",
      trash: "Vai para a lixeira do sistema.",
    },
  },
  tabs: {
    closeTab: "Fechar aba",
    close: "Fechar",
    closeOthers: "Fechar outras",
    closeAll: "Fechar todas",
  },
  status: {
    noWorkspace: "Nenhum workspace",
    switchWorkspace: "Trocar workspace",
    activeEnvironment: "Environment ativo",
    manageEnvironments: "Gerenciar environments",
    manage: "Gerenciar",
    noEnvironment: "Nenhum environment",
    responsePanelPosition: "Painel de resposta: {position}",
    theme: "Tema: {theme}",
    documentation: "Documentação",
    jwtTool: "Ferramenta JWT",
    preferences: "Preferências",
    scriptPreRequestFailed: "Script de pre-request falhou",
    scriptTestsFailed: "{failed}/{total} testes falharam",
    scriptTestsPassed: "{total} testes passaram",
  },
  env: {
    prod: "PROD",
  },
  method: {
    ariaLabel: "Método HTTP",
  },
  landing: {
    notWorkspaceTitle: "Ainda não é um workspace",
    notWorkspaceDescription:
      'O caminho "{path}" não tem um wttp.yaml. Inicializar como um workspace novo?',
    workspaceNamePlaceholder: "Nome do workspace",
    initializeHere: "Inicializar aqui",
    chooseDifferentFolder: "Escolher outra pasta",
    tagline: "Abra ou crie um workspace para começar.",
    openWorkspace: "Abrir workspace",
    createWorkspace: "Criar workspace",
    import: "Importar",
    noRootFolder: "Nenhuma pasta raiz de workspaces definida",
    setIt: "Definir",
    workspaces: "Workspaces",
    recent: "Recentes",
    noYamlYet: "Ainda sem wttp.yaml",
    missing: "Ausente",
    remove: "Remover",
    createWorkspaceTitle: "Criar workspace",
  },
  command: {
    title: "Busca rápida",
    placeholder: "Buscar requests por nome, caminho ou URL…",
    noMatches: "Nenhum resultado.",
  },
  prefs: {
    sectionsAria: "Seções de preferências",
    sections: {
      general: "Geral",
      workspaces: "Workspaces",
      updates: "Atualizações",
      shortcuts: "Atalhos",
      about: "Sobre",
    },
    theme: {
      title: "Tema",
      description: "Aplica na hora, sem precisar reiniciar.",
    },
    language: {
      title: "Idioma",
      description: "Troca o idioma da UI na hora, sem precisar reiniciar.",
      system: "Sistema",
      en: "English",
      ptBR: "Português (Brasil)",
    },
    restoreDefaults: {
      title: "Restaurar padrões de fábrica",
      description:
        "Restaura toda preferência desta tela (tema, idioma, pasta raiz de workspaces, atalhos de teclado) para o padrão. Não mexe em nenhum workspace nem nos dados dele.",
      button: "Restaurar padrões de fábrica",
      confirm: "Clique de novo para confirmar",
      cannotUndo: "Isso não pode ser desfeito.",
    },
    workspaces: {
      title: "Pasta raiz de workspaces",
      description:
        "Workspaces criados sem escolher uma pasta, e o seletor de workspaces na tela inicial, usam esta pasta.",
      notSet: "Não definida",
      change: "Trocar…",
      createdIn: "Workspaces são criados em: {dir}/",
      mustSet: "Defina isso antes de criar um workspace — não dá para criar um workspace sem ela.",
    },
    updates: {
      autoTitle: "Atualizações automáticas",
      autoDescription:
        "Verifica uma versão nova ao abrir o app e periodicamente em segundo plano, e baixa em silêncio — instalar continua esperando você reiniciar o app ou clicar em Atualizar agora.",
      on: "Ligado",
      off: "Desligado",
      statusTitle: "Status",
      checkNowTitle: "Verificar agora",
      checkButton: "Verificar atualizações",
      status: {
        idle: "Ainda não verificado.",
        checking: "Verificando atualizações…",
        available: "Versão {version} encontrada — baixando…",
        notAvailable: "Você já está atualizado.",
        downloading: "Baixando atualização… {percent}%",
        downloaded: "Versão {version} pronta — reinicie para instalar.",
        error: "Não deu para verificar atualizações. Vai tentar de novo automaticamente.",
        unsupported:
          "Instalado a partir de um pacote .deb — atualizações vêm do gerenciador de pacotes (apt/dpkg), não de dentro do app.",
      },
    },
    shortcuts: {
      clickToRecord: "Clique num atalho para gravar um novo.",
      resetAll: "Restaurar todos ao padrão",
      alreadyUsedBy: 'Já usado por "{label}"',
    },
    about: {
      version: "Versão",
      documentation: "Documentação",
      openDocumentation: "Abrir documentação",
      offlineDocumentation: "Documentação offline",
      openOfflineDocumentation: "Abrir docs embutida",
      repository: "Repositório",
      openGithub: "Abrir no GitHub",
    },
  },
};

import type { responseEn } from "./response.en";

export const responsePtBR: typeof responseEn = {
  response: {
    filter: {
      open: "Filtrar com JSONPath (Ctrl+F)",
      jsonOnly: "O filtro JSONPath só funciona em respostas JSON",
      placeholder: "$.data.items[*].id",
      clear: "Limpar filtro",
      matchesOne: "1 resultado",
      matchesOther: "{count} resultados",
      syntaxError: "JSONPath inválido na posição {position}: {message}",
      invalidJson:
        "O body da resposta não é um JSON válido (pode ter sido truncado), então não dá para filtrar",
    },
    tabs: {
      error: "Erro",
      body: "Response",
      headers: "Headers",
      cookies: "Cookies",
      history: "Histórico",
      tests: "Testes",
    },
    view: { pretty: "Formatado", raw: "Bruto", preview: "Prévia", tree: "Árvore" },
    tree: {
      showMore: "Mostrar mais ({count} restantes)…",
      saveVariable: "Salvar em variável a cada envio",
      assertEquals: "Adicionar asserção: igual ao valor atual",
      assertTruthy: "Adicionar asserção: está definido",
      saveEnvironment: "Salvar valor atual no environment",
      copyValue: "Copiar valor",
      copyPath: "Copiar caminho",
      lineAdded: "Linha adicionada ao script de Tests — salve a request para manter",
      invalid: "O corpo da resposta não é um JSON válido, então não há árvore para mostrar",
      modal: {
        variableTitle: "Salvar em variável",
        environmentTitle: "Salvar no environment",
        name: "Nome da variável",
        currentValue: "Valor atual: {value}",
        noEnvironment: "Nenhum environment ativo — escolha um na barra de status antes.",
        overwrite: '"{name}" já existe no environment e será sobrescrita.',
        overwriteSecret: '"{name}" é um segredo no environment. Salvar substitui o valor dele.',
        confirm: "Adicionar",
        overwriteConfirm: "Sobrescrever segredo",
      },
    },
    preRequestFailed: "Script de pre-request falhou ({source}) — request não enviada",
    empty: {
      title: "Nenhuma resposta ainda",
      description: "Envie uma request para ver a resposta aqui.",
    },
    sending: { title: "Enviando request…", description: "Aguardando uma resposta." },
    historyFallback:
      "Nenhuma resposta enviada nesta sessão ainda — mostrando a última do histórico.",
    truncated:
      "Mostrando os primeiros {shown} de {total} — use Salvar para obter a resposta completa.",
    previewAlt: "Prévia da resposta",
    htmlPreviewTitle: "Prévia HTML da resposta",
    binary: {
      title: "Conteúdo binário",
      description: "Esta resposta não é texto — use Salvar para gravar em um arquivo.",
    },
    noCookies: { title: "Nenhum cookie", description: "Esta resposta não definiu cookies." },
    timing: {
      dns: "DNS: {value}",
      connect: "Conexão: {value}",
      tls: "TLS: {value}",
      ttfb: "TTFB: {value}",
      download: "Download: {value}",
      total: "Total: {value}",
    },
    copyBody: "Copiar corpo",
    saveToFile: "Salvar resposta em arquivo",
    errorBadge: "erro",
    errors: {
      DNS_ERROR: "Não foi possível resolver o host. Confira a URL e sua conexão de rede.",
      TLS_ERROR:
        "O handshake TLS/SSL falhou. O certificado pode ser inválido ou autoassinado — confira a configuração validateTls do workspace.",
      TIMEOUT:
        "A request expirou. O servidor pode estar lento ou inacessível — tente aumentar o timeout nas configurações da request.",
      CANCELLED: "A request foi cancelada.",
      CONNECTION_REFUSED:
        "A conexão foi recusada. Confira se o host e a porta estão corretos e se o servidor está rodando.",
      REQUEST_FAILED: "A request falhou. Veja o detalhe abaixo para mais informações.",
      UNKNOWN: "Ocorreu um erro inesperado ao enviar a request.",
    },
  },
  history: {
    compare: {
      pickTwo: "Marque duas execuções para comparar",
      pick: "Selecionar a execução de {time}",
      compareSelected: "Comparar ({count}/2)",
      withPrevious: "Comparar com a execução anterior",
      range: "{before} → {after}",
      ignoreHeaders: "Ignorar headers",
      ignored: "Ignorados:",
      unignore: "Parar de ignorar {path}",
      headerPattern: "header {name}",
      truncated:
        "Um dos bodies foi truncado ao ir para o histórico — o diff só cobre o que foi guardado.",
      nothing: "Nenhuma diferença.",
      status: "Status",
      headers: "Headers",
      body: "Body",
      ignorePath: "Ignorar este caminho",
      copyPath: "Copiar caminho",
      kind: {
        added: "adicionado",
        removed: "removido",
        changed: "alterado",
        typeChanged: "tipo trocado",
      },
    },
    empty: {
      title: "Nenhum histórico ainda",
      description: "Envie esta request para começar a montar o histórico dela.",
    },
    clear: "Limpar histórico",
    back: "Voltar",
    bodyTruncated: "O corpo desta entrada foi truncado antes de ser salvo no histórico.",
    binary: {
      title: "Conteúdo binário",
      description: "Esta resposta não é texto — não é exibida no histórico.",
    },
  },
  scriptResults: {
    preRequestFailed: "Script de pre-request falhou ({source})",
    notSent: "A request não foi enviada.",
    empty: {
      title: "Nenhum script de teste",
      description: "Esta request não tem scripts de teste definidos.",
    },
    assertions: "Asserções — {passed}/{total} passaram",
    console: "Console",
  },
};

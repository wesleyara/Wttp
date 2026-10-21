import type { websocketEn } from "./websocket.en";

export const websocketPtBR: typeof websocketEn = {
  websocket: {
    badge: "WS",
    urlPlaceholder: "wss://echo.exemplo.com/socket",
    connect: "Conectar",
    disconnect: "Desconectar",
    state: {
      connecting: "Conectando…",
      open: "Conectado",
      reconnecting: "Reconectando (tentativa {attempt})…",
      closed: "Desconectado",
    },
    tabs: {
      connection: "Conexão",
    },
    settings: {
      subprotocols: "Subprotocolos",
      subprotocolsPlaceholder: "chat, superchat",
      subprotocolsHint:
        "Separados por vírgula, em ordem de preferência (Sec-WebSocket-Protocol). Vale na próxima conexão.",
      reconnect: "Reconectar automaticamente",
      reconnectHint: "Só após uma queda inesperada — Desconectar nunca reconecta.",
      maxAttempts: "Máximo de tentativas",
      maxAttemptsHint: "Tentativas seguidas que falham antes de desistir. 0 = sem limite.",
      delay: "Espera entre tentativas (ms)",
    },
    messages: {
      title: "Mensagens",
      filterPlaceholder: "Filtrar mensagens…",
      all: "Todas",
      sent: "Enviadas",
      received: "Recebidas",
      clear: "Limpar",
      count: "{shown} de {total}",
      emptyTitle: "Nenhuma mensagem ainda",
      emptyDescription: "Conecte e envie uma mensagem para ver a conversa aqui.",
      noMatches: "Nenhuma mensagem corresponde ao filtro.",
      composerPlaceholder: "Mensagem a enviar",
      format: "Formato",
      formatText: "Texto",
      formatJson: "JSON",
      send: "Enviar",
      invalidJson: "JSON inválido",
      sizeBytes: "{size} B",
      out: "Enviada",
      in: "Recebida",
      copy: "Copiar",
    },
    log: {
      connected: "Conectado",
      connectedWith: "Conectado (subprotocolo: {protocol})",
      reconnecting: "Conexão perdida — reconectando (tentativa {attempt})",
      closed: "Encerrada ({code}) {reason}",
      noReason: "sem motivo informado",
      error: "Erro: {message}",
    },
    toast: {
      urlRequired: "Informe antes uma URL ws:// ou wss://.",
      unresolved: "Variáveis não resolvidas: {names}",
    },
  },
  websocketMenu: {
    newWebSocket: "Novo WebSocket",
  },
};

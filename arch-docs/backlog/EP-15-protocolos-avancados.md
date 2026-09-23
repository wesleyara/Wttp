# EP-15 — Protocolos e recursos avançados

**Status:** Pendente · **Alvo:** v0.3+ · **Depende de:** EP-13

Reservatório de funcionalidades além do HTTP básico. Cada item aqui é independente — a ordem é por demanda dos usuários, não por dependência técnica. Um item só vira épico próprio quando for priorizado.

---

## Protocolos

**GraphQL.** Editor de query e variables com autocomplete a partir da introspecção do schema, e visualização de erros no formato GraphQL.

**WebSocket.** Conexão persistente, envio e recebimento de mensagens, histórico da sessão, reconexão automática.

**Server-Sent Events.** Stream de eventos com histórico e filtro por tipo.

**gRPC.** Carregar `.proto`, listar serviços e métodos, chamadas unárias e de streaming, reflexão do servidor quando disponível.

**Socket.IO.** Eventos nomeados, namespaces e rooms.

---

## Rede

**Jar de cookies.** Armazenamento por domínio, reenvio automático, editor manual e opção de isolar por environment.

**Proxy.** Proxy HTTP/HTTPS/SOCKS por workspace, com autenticação e lista de exceções.

**Certificados de cliente.** mTLS por host, com certificado e chave apontados por caminho relativo ao workspace.

**Captura de tráfego.** Modo proxy que intercepta requisições de outras aplicações e as transforma em requests do Wttp.

---

## Produtividade

**Geração de snippets.** Converter a request em cURL, fetch, axios, Python requests, Go, C# e outros.

**Histórico.** Todas as requisições enviadas, com filtro e possibilidade de salvar na collection. Retenção configurável, respeitando segredos.

**Diff de respostas.** Comparar duas execuções da mesma request, destacando diferenças de body, headers e status.

**Mock server.** Servir respostas de exemplo a partir da collection, para desenvolvimento de frontend sem backend pronto.

**Sincronização em nuvem opcional.** Sempre opt-in, sempre com o filesystem como fonte da verdade — o modelo local-first não é negociável. Provavelmente via Git, não via servidor próprio.

---

## Critério para promover um item

Um item sai desta lista e vira épico quando:

1. Há demanda registrada (issues, discussões) ou é bloqueio para um caso de uso relevante.
2. O núcleo suporta a extensão sem refatoração ampla.
3. Cabe no modelo local-first e no formato de arquivo, ou a mudança de formato já foi desenhada em [file-format.md](../file-format.md).

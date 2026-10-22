# Conexões WebSocket

Uma request WebSocket mantém uma conexão aberta com o servidor: você manda mensagens quando
quiser e vê, na hora, tudo o que chega. Serve para depurar chat, notificações, cotações e
qualquer API que fale por `ws://` ou `wss://`.

## Criar e conectar

No menu **+** da árvore (ou no menu de contexto de uma pasta) escolha **Novo WebSocket**. A
request aparece na árvore com o rótulo **WS**, no lugar do método HTTP.

1. Digite a URL (`wss://exemplo.com/socket`). `{{variáveis}}` funcionam como numa request HTTP.
2. Clique em **Conectar** (ou `Ctrl+Enter` na barra de URL). O indicador ao lado mostra
   *Conectando…*, *Conectado*, *Reconectando…* ou *Desconectado*.
3. Escreva uma mensagem no campo de baixo e clique em **Enviar** (`Ctrl+Enter`).

Ao fechar a aba a conexão é encerrada.

## O que configurar

- **Params, Headers e Auth** funcionam como numa request HTTP e vão no handshake de
  conexão. Bearer, Basic e API key (em header ou query) são aplicados do mesmo jeito, inclusive
  a herança da pasta e da collection. Um header `Authorization` digitado à mão vence o da aba Auth.
- **Connection**:
  - **Subprotocolos**: lista separada por vírgula, em ordem de preferência
    (`Sec-WebSocket-Protocol`). O que o servidor escolheu aparece no histórico.
  - **Reconectar automaticamente**, com **máximo de tentativas** (`0` = sem limite) e a **espera
    entre tentativas**.

::: tip Reconexão só para quedas inesperadas
Se a rede cair ou o servidor fechar a conexão, o Wttp tenta de novo conforme configurado.
**Desconectar** nunca reconecta. Uma conexão que volta zera a contagem de tentativas.
:::

Variável não resolvida bloqueia a conexão e o aviso diz quais são, como num envio HTTP.

## Mensagens

O painel da direita é o histórico da sessão: mensagens enviadas (↗), recebidas (↙) e eventos
da conexão (conectou, caiu, reconectando, erro). Cada linha tem a hora, o tamanho em bytes e
um botão para copiar; clique na linha para expandir mensagens longas.

- **Filtros**: *Todas*, *Enviadas* ou *Recebidas*, mais uma busca por texto. Eventos da
  conexão aparecem sempre.
- **Formato**: *Texto* envia como está. *JSON* valida antes de enviar (campo vermelho se
  estiver inválido) e manda compacto.
- Mensagens binárias recebidas aparecem como texto quando são UTF-8 válido, ou como um dump
  hexadecimal.
- O histórico guarda as últimas 5000 linhas. **Limpar** esvazia.

## O que vai para o arquivo

A request é um `.req.yaml` com `protocol: websocket`: URL, query, headers, auth, subprotocolos,
configuração de reconexão e o rascunho da mensagem (o texto e o formato do compositor).
**O histórico de mensagens não é salvo**; ele só existe durante a sessão. O arquivo é texto
legível e versiona no Git como qualquer outra request ([versionamento](/guia/versionamento)).

## Limites

- Requests WebSocket ficam **fora do Runner e do CLI** (`wttp run`): uma conexão persistente
  não é um par pedido/resposta que dê para repetir e testar em lote.
- Não há scripts nem body numa request WebSocket.
- A verificação de certificado TLS segue a do sistema (a opção "validar TLS" das requests HTTP
  não se aplica).

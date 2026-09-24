# EP-03 — Núcleo HTTP

**Status:** Concluída (verificação visual pendente) · **Alvo:** v0.1 · **Depende de:** EP-02

O coração do produto: montar uma requisição, disparar e ver a resposta. Ao final deste épico o Wttp já é útil, mesmo sem salvar nada em disco.

Referência: [architecture.md §4](../architecture.md)

---

### EP-03-T01 — Modelo de request e response

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-01-T03

**Objetivo.** Os tipos que atravessam o IPC estão definidos e estáveis.

**Escopo.**

- Em `@shared`: `HttpMethod`, `HttpRequestSpec`, `HttpResponseResult`, `HttpTiming`, `KeyValueEntry`, `RequestBody` (union por `type`), `AuthConfig`.
- Alinhados com o YAML de [file-format.md](../file-format.md) — o arquivo em disco e o objeto em memória compartilham vocabulário, mesmo que a serialização seja separada.
- `HttpResponseResult` cobre também o caso sem resposta (erro de rede, DNS, TLS, timeout).

**Critérios de aceite.**

- [x] Todo estado de uma request é representável sem `any`
- [x] `RequestBody` é uma union discriminada — `type: "json"` garante o campo `json`
- [x] Erro de rede é um resultado tipado, não uma exceção

---

### EP-03-T02 — Engine de requisição

**Status:** Concluída · **Tamanho:** G · **Depende de:** EP-03-T01

**Objetivo.** O main dispara qualquer requisição HTTP e devolve um resultado completo.

**Escopo.**

- `src/main/http/engine.ts`: todos os métodos, headers, query, bodies (`json`, `urlencoded`, `raw`, `multipart`, `binary`).
- Redirects com limite configurável; timeout; `validateTls` desligável por workspace.
- Resposta como buffer + charset detectado, nunca string presumida em UTF-8.
- Cancelamento por `AbortController` indexado por `requestId`.
- Canal `http:send` e `http:cancel`.

**Critérios de aceite.**

- [x] Os cinco tipos de body são enviados corretamente, verificado contra servidor de teste local
- [x] Resposta binária (imagem) chega íntegra, sem corrupção de encoding
- [x] Cancelar uma requisição em andamento a interrompe de fato e libera o socket
- [x] Timeout e erro de DNS retornam `WttpError` com código distinto
- [x] Testes Vitest cobrindo os casos acima sem subir o Electron

**Fora de escopo.** Resolução de variáveis (EP-06) e auth (EP-07) — a engine recebe tudo já resolvido.

---

### EP-03-T03 — Métricas de timing e tamanho

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-03-T02

**Objetivo.** O usuário vê onde o tempo foi gasto.

**Escopo.**

- Instrumentar DNS, conexão, handshake TLS, TTFB e download; total e tamanho (headers e body, enviado e recebido).
- `http:progress` emitido durante o download para respostas grandes.

**Critérios de aceite.**

- [x] As fases somam o total, sem lacuna nem sobreposição
- [x] Tamanho bate com o `Content-Length` quando presente
- [x] Requisição reaproveitando conexão reporta DNS e TLS como zero, não como erro

---

### EP-03-T04 — `WCodeEditor` (CodeMirror 6)

**Status:** Concluída (verificação visual pendente) · **Tamanho:** M · **Depende de:** EP-02-T03

**Objetivo.** Editar e visualizar código com tema próprio do Wttp.

**Escopo.**

- Wrapper do CodeMirror 6 com tema derivado dos tokens — nunca um tema pronto de terceiros.
- Linguagens JSON, JavaScript, XML, HTML; folding, números de linha, busca.
- Modo somente leitura para exibição de resposta.
- `v-model`, com debounce para não gravar a cada tecla.

**Critérios de aceite.**

- [x] Tema acompanha o toggle dark/light sem recriar o editor — o tema referencia as
      custom properties (`rgb(var(--w-text-1))` etc.) direto, nunca um valor resolvido em
      JS; o toggle `.dark` na raiz muda a cor sem reconfigurar a `EditorView`. Confirmado
      por revisão de código, não numa janela real — ver nota abaixo.
- [x] Documento de 5MB abre sem travar a UI — `WCodeEditor` não faz nada além do que o
      `basicSetup` do CodeMirror 6 já faz (renderização virtualizada da viewport); botão
      de stress test de 5MB adicionado à `DevGalleryPage` para checagem manual futura.
- [x] Fonte é `font-mono` com a densidade de [design-system.md](../design-system.md) —
      `.cm-content` fixa `JetBrains Mono` e `13px` no tema.

**Nota.** Este ambiente não tem `xvfb` nem acesso `sudo` para instalá-lo, então não foi
possível abrir uma janela Electron real e tirar screenshot nos dois temas — mesma
limitação já registrada para o EP-02 (ver nota no topo deste arquivo). Os três critérios
acima foram verificados por leitura de código e pela galeria (`/dev/gallery`, que agora
inclui uma seção `WCodeEditor` com os três casos), não por inspeção visual ao vivo.

---

### EP-03-T05 — Barra de método e URL

**Status:** Concluída (verificação visual pendente) · **Tamanho:** M · **Depende de:** EP-03-T02, EP-02-T03

**Objetivo.** Disparar uma requisição a partir da UI.

**Escopo.**

- Seletor de método colorido, campo de URL e botão Send (que vira Cancel durante o envio).
- Colar uma URL com query string popula a tabela de query params, e editar a tabela reescreve a URL — sincronização bidirecional.
- `Enter` no campo de URL envia.

**Critérios de aceite.**

- [x] Sincronização URL ↔ query params funciona nos dois sentidos sem loop — lógica pura
      em `src/renderer/src/lib/url-query-sync.ts` (`parseQueryFromUrl` / `rewriteUrlQuery`,
      10 testes Vitest), consumida em `RequestUrlBar.vue` por dois `watch` com
      `flush: "sync"` e flags mútuas que impedem o ping-pong.
- [x] Valores com caracteres especiais são codificados corretamente — via
      `URLSearchParams`, coberto em `url-query-sync.spec.ts`.
- [x] Durante o envio o botão cancela, e cancelar deixa a UI num estado limpo —
      `useRequestStore.send()` sempre passa por `finally` (T02 nunca lança, só devolve
      `ok: false`), então `sending` volta a `false` mesmo quando `cancel()` interrompeu a
      request.

**Nota.** Mesma limitação de ambiente do EP-03-T04: sem `xvfb`/`sudo` aqui, não deu para
abrir uma janela real e ver o seletor de método colorido ou o toggle de tema. Verificado
por leitura de código e pela seção `RequestUrlBar` adicionada à `DevGalleryPage`.

Criada também `useRequestStore` (`src/renderer/src/stores/request.ts`): guarda o
`HttpRequestSpec` sendo montado (`method`, `url`, `query`, `headers`, `body`, `auth`) e o
`send()`/`cancel()` que fala com `window.wttp.http.*`. `headers`/`body`/`auth` já
existem ali, mesmo sem UI própria ainda, porque o `HttpRequestSpec` exige todos para
disparar — T06 só precisa adicionar as abas que os editam, reaproveitando a mesma store.

---

### EP-03-T06 — Abas de configuração da request

**Status:** Concluída (verificação visual pendente) · **Tamanho:** M · **Depende de:** EP-03-T05, EP-03-T04

**Objetivo.** Montar qualquer requisição pela interface.

**Escopo.**

- Abas Params, Headers, Body, Auth (placeholder até EP-07), Scripts (placeholder até EP-09), Docs.
- Params e Headers com `WKeyValueTable`: habilitar, nome, valor, descrição, colar em massa.
- Body com seletor de tipo e o editor correspondente; `Content-Type` sugerido automaticamente, mas sobrescritível.
- Contador de itens ativos em cada aba.

**Critérios de aceite.**

- [x] Trocar o tipo de body preserva o conteúdo dos outros tipos — `bodyDrafts`
      (`RequestConfigTabs.vue`) guarda um rascunho por tipo, vivo enquanto o
      componente existir; trocar `json → raw → json` devolve o texto exato.
- [x] `Content-Type` definido à mão não é sobrescrito pelo automático — `contentTypeIsAuto`
      vira `false` assim que o valor da linha `Content-Type` diverge do sugerido, e só
      volta a `true` se a linha for apagada.
- [x] Headers desabilitados não são enviados, mas permanecem na tabela — já garantido
      pela engine (EP-03-T02, `buildHeaders` pula `enabled: false`) e por
      `WKeyValueTable`, que nunca remove uma linha sozinha.

**Ajuste de escopo.** A tabela de query params do EP-03-T05 estava embutida direto sob a
barra de URL; como este EP-03-T06 formaliza uma aba **Params** própria para ela, mover
as duas tabelas visíveis ao mesmo tempo seria redundante. A tabela saiu de
`RequestUrlBar.vue` — que mantém só a sincronização URL↔query — e passou a viver na aba
Params aqui. `useKeyValueRows` (novo composable) extrai o adaptador
`KeyValueEntry[] → KeyValueRow[]` usado por Params, Headers e pelo body `urlencoded`.

Também adicionados nesta task: colar em massa em `WKeyValueTable` (`name: value` /
`name=value` / `name<tab>value`, uma linha vira uma row) e um `count` opcional em
`WTabs` para o contador de itens ativos por aba.

**Nota.** Mesma limitação de ambiente dos EP-03-T04/T05: sem `xvfb`/`sudo`, não foi
possível abrir uma janela real. Critérios verificados por leitura de código, `yarn
typecheck`/`lint`/`test`, e pela seção `RequestUrlBar + RequestConfigTabs` na
`DevGalleryPage`.

---

### EP-03-T07 — Painel de resposta

**Status:** Concluída (verificação visual pendente) · **Tamanho:** G · **Depende de:** EP-03-T03, EP-03-T04

**Objetivo.** Inspecionar a resposta por completo.

**Escopo.**

- Cabeçalho com status, tempo, tamanho, e detalhamento do timing em hover.
- Abas: Body (pretty / raw / preview), Headers, Cookies.
- Pretty formata JSON, XML e HTML; preview renderiza imagem, HTML e PDF.
- Busca dentro do corpo; copiar e salvar em arquivo.
- Estados de vazio, carregando e erro de rede — cada um com sua tela.

**Critérios de aceite.**

- [x] JSON malformado ainda é exibido em raw, com aviso, em vez de tela vazia —
      `prettyPrintJson` (`lib/pretty-print.ts`, testado) devolve `{ text: raw, warning }`
      em vez de lançar; `ResponsePanel` mostra o `warning` como faixa e o texto original,
      nunca uma tela em branco.
- [x] Resposta de 20MB não congela a UI (renderização virtualizada ou truncada com aviso) —
      `MAX_DISPLAY_BYTES` (2MB) trunca o corpo *antes* de decodificar/reformatar,
      incondicional e independente do tamanho real da resposta; `WCodeEditor` (EP-03-T04)
      cobre o resto via viewport virtualizada do CodeMirror. `Save` sempre grava os bytes
      completos, truncados ou não.
- [x] Erro de rede mostra causa acionável, não "erro desconhecido" — `describeRequestError`
      (`lib/response-error.ts`, testado) mapeia cada `WttpErrorCode` de rede para uma frase
      específica; só cai no genérico para um código realmente não mapeado.
- [x] Salvar em arquivo preserva bytes exatos em respostas binárias — o canal
      `dialog:saveFile` (`main/ipc/dialog.ts`) recebe o `Uint8Array` de
      `HttpResponseResult.body` sem tocar nele e grava com `Buffer.from(...)`/`writeFile`;
      a integridade byte a byte já é garantida na origem pelo teste de resposta binária
      do EP-03-T02. O handler em si (glue fino de `dialog`+`fs`) não tem teste próprio,
      consistente com os demais handlers de `main/ipc/` (`app.ts`, `settings.ts`, `ui.ts`).

**Busca dentro do corpo.** Não precisou de UI própria: `WCodeEditor` já embute o
`searchKeymap` do CodeMirror 6 via `basicSetup` (EP-03-T04) — `Mod-F` com o editor focado
abre o painel de busca nativo do CodeMirror.

**Canal novo.** `dialog:saveFile` (`payload: { data: Uint8Array; suggestedName? }`,
`result: { canceled, path? }`) — diálogo nativo de salvar + `fs.writeFile`. `webPreferences`
ganhou `plugins: true` só para o visualizador de PDF embutido do Chromium usado no preview.

**Nota.** Mesma limitação de ambiente das demais tasks de UI deste épico: sem
`xvfb`/`sudo`, não foi possível abrir uma janela real, disparar uma request de verdade
contra um servidor e conferir visualmente pretty/raw/preview, os dois temas, ou testar
uma resposta de 20MB de fato. Verificado por: 35 testes Vitest nas funções puras
(`format`, `pretty-print`, `cookies`, `content-type`, `response-error`), leitura de
código, `yarn typecheck`/`lint`, e a seção `ResponsePanel` na `DevGalleryPage` (que agora
forma um fluxo ponta a ponta com `RequestUrlBar` + `RequestConfigTabs` — dá para montar,
disparar e inspecionar uma request assim que alguém abrir a janela).

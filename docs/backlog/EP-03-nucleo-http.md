# EP-03 — Núcleo HTTP

**Status:** Pendente · **Alvo:** v0.1 · **Depende de:** EP-02

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

**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-03-T01

**Objetivo.** O main dispara qualquer requisição HTTP e devolve um resultado completo.

**Escopo.**

- `src/main/http/engine.ts`: todos os métodos, headers, query, bodies (`json`, `urlencoded`, `raw`, `multipart`, `binary`).
- Redirects com limite configurável; timeout; `validateTls` desligável por workspace.
- Resposta como buffer + charset detectado, nunca string presumida em UTF-8.
- Cancelamento por `AbortController` indexado por `requestId`.
- Canal `http:send` e `http:cancel`.

**Critérios de aceite.**

- [ ] Os cinco tipos de body são enviados corretamente, verificado contra servidor de teste local
- [ ] Resposta binária (imagem) chega íntegra, sem corrupção de encoding
- [ ] Cancelar uma requisição em andamento a interrompe de fato e libera o socket
- [ ] Timeout e erro de DNS retornam `WttpError` com código distinto
- [ ] Testes Vitest cobrindo os casos acima sem subir o Electron

**Fora de escopo.** Resolução de variáveis (EP-06) e auth (EP-07) — a engine recebe tudo já resolvido.

---

### EP-03-T03 — Métricas de timing e tamanho

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-03-T02

**Objetivo.** O usuário vê onde o tempo foi gasto.

**Escopo.**

- Instrumentar DNS, conexão, handshake TLS, TTFB e download; total e tamanho (headers e body, enviado e recebido).
- `http:progress` emitido durante o download para respostas grandes.

**Critérios de aceite.**

- [ ] As fases somam o total, sem lacuna nem sobreposição
- [ ] Tamanho bate com o `Content-Length` quando presente
- [ ] Requisição reaproveitando conexão reporta DNS e TLS como zero, não como erro

---

### EP-03-T04 — `WCodeEditor` (CodeMirror 6)

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-02-T03

**Objetivo.** Editar e visualizar código com tema próprio do Wttp.

**Escopo.**

- Wrapper do CodeMirror 6 com tema derivado dos tokens — nunca um tema pronto de terceiros.
- Linguagens JSON, JavaScript, XML, HTML; folding, números de linha, busca.
- Modo somente leitura para exibição de resposta.
- `v-model`, com debounce para não gravar a cada tecla.

**Critérios de aceite.**

- [ ] Tema acompanha o toggle dark/light sem recriar o editor
- [ ] Documento de 5MB abre sem travar a UI
- [ ] Fonte é `font-mono` com a densidade de [design-system.md](../design-system.md)

---

### EP-03-T05 — Barra de método e URL

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-03-T02, EP-02-T03

**Objetivo.** Disparar uma requisição a partir da UI.

**Escopo.**

- Seletor de método colorido, campo de URL e botão Send (que vira Cancel durante o envio).
- Colar uma URL com query string popula a tabela de query params, e editar a tabela reescreve a URL — sincronização bidirecional.
- `Enter` no campo de URL envia.

**Critérios de aceite.**

- [ ] Sincronização URL ↔ query params funciona nos dois sentidos sem loop
- [ ] Valores com caracteres especiais são codificados corretamente
- [ ] Durante o envio o botão cancela, e cancelar deixa a UI num estado limpo

---

### EP-03-T06 — Abas de configuração da request

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-03-T05, EP-03-T04

**Objetivo.** Montar qualquer requisição pela interface.

**Escopo.**

- Abas Params, Headers, Body, Auth (placeholder até EP-07), Scripts (placeholder até EP-09), Docs.
- Params e Headers com `WKeyValueTable`: habilitar, nome, valor, descrição, colar em massa.
- Body com seletor de tipo e o editor correspondente; `Content-Type` sugerido automaticamente, mas sobrescritível.
- Contador de itens ativos em cada aba.

**Critérios de aceite.**

- [ ] Trocar o tipo de body preserva o conteúdo dos outros tipos
- [ ] `Content-Type` definido à mão não é sobrescrito pelo automático
- [ ] Headers desabilitados não são enviados, mas permanecem na tabela

---

### EP-03-T07 — Painel de resposta

**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-03-T03, EP-03-T04

**Objetivo.** Inspecionar a resposta por completo.

**Escopo.**

- Cabeçalho com status, tempo, tamanho, e detalhamento do timing em hover.
- Abas: Body (pretty / raw / preview), Headers, Cookies.
- Pretty formata JSON, XML e HTML; preview renderiza imagem, HTML e PDF.
- Busca dentro do corpo; copiar e salvar em arquivo.
- Estados de vazio, carregando e erro de rede — cada um com sua tela.

**Critérios de aceite.**

- [ ] JSON malformado ainda é exibido em raw, com aviso, em vez de tela vazia
- [ ] Resposta de 20MB não congela a UI (renderização virtualizada ou truncada com aviso)
- [ ] Erro de rede mostra causa acionável, não "erro desconhecido"
- [ ] Salvar em arquivo preserva bytes exatos em respostas binárias

# EP-10 — Qualidade e CI

**Status:** Em andamento · **Alvo:** v0.1 · **Depende de:** EP-09

Rede de segurança antes de distribuir. Um cliente HTTP que corrompe os arquivos do usuário perde a confiança de uma vez só — e os arquivos são o produto.

---

### EP-10-T01 — Suíte de testes do núcleo

**Status:** Concluída · **Tamanho:** G · **Depende de:** EP-09-T03

**Objetivo.** As três camadas críticas têm cobertura real.

**Escopo.**

- **`main/http`**: todos os tipos de body, redirects, timeout, cancelamento, erro de rede, timing.
- **`main/storage`**: round-trip byte a byte de todos os tipos de arquivo, validação, migração, escrita atômica.
- **`main/importers`**: fixture real por formato com teste de snapshot.
- Servidor HTTP local de teste para o engine — sem dependência de rede externa.
- Limiar de cobertura configurado e obrigatório nessas três pastas.

A cobertura já existente (54 arquivos de spec) era substancial antes desta task —
`engine.spec.ts` já cobria todos os tipos de body, redirects (301/302/303, desabilitado,
`maxRedirects`), timeout, cancelamento, DNS/conexão recusada e timing contra um
`http.createServer` local; `roundtrip.spec.ts` já cobria os quatro tipos de arquivo
(`workspace`/`folder`/`request`/`environment`); `fsAtomic`/`tree.spec.ts` já cobriam
escrita atômica (temp file + rename, preserva o original numa falha no meio, detecta
edição externa concorrente); Postman/Insomnia/OpenAPI já tinham fixture real +
snapshot. O trabalho desta task foi fechar as lacunas reais encontradas na auditoria e
ligar o limiar de cobertura, que não existia:

- `main/importers`: cURL era o único dos quatro formatos sem fixture real nem teste de
  snapshot — só comandos sintéticos inline. Adicionado
  `__fixtures__/github-get-repo.curl.txt` (exemplo "Get a repository" copiado
  verbatim da documentação REST da GitHub) e três testes novos em
  `curl.integration.spec.ts`, seguindo o padrão dos outros três importadores
  (`detect`, import completo com `readNode`, snapshot de `normalize`).
- `main/storage/activeWorkspace.ts` estava em 0% de cobertura — módulo pequeno mas
  real (raiz do workspace ativo, usado por `secret:get`/`secret:set`). Novo
  `activeWorkspace.spec.ts`.
- `main/storage/migrations/registry.ts`: o laço de encadeamento de migradores em
  `migrateToCurrent` nunca era exercitado (só o guard inicial de versão não suportada).
  Novo caso em `registry.spec.ts` simulando uma versão intermediária sem migrador
  registrado no caminho.
- `@vitest/coverage-v8@4.1.10` (pareado com a versão do `vitest` já instalada) como
  dependência de desenvolvimento; `vitest.config.ts` ganhou o bloco `test.coverage`
  (`provider: "v8"`, `include` restrito a `src/main/http/**`, `src/main/storage/**`,
  `src/main/importers/**`, `exclude` de specs/fixtures/snapshots) com `thresholds` de
  85% linhas/statements, 80% funções/branches — abaixo dos ~92-96% obtidos após o
  gap-filling, com folga para variação normal entre execuções. Script novo
  `test:coverage` (`vitest run --coverage`) no `package.json`; falha de fato o processo
  quando a cobertura cai abaixo do limiar (verificado subindo o limiar
  temporariamente e confirmando o `ERROR: Coverage for lines (...) does not meet
  global threshold`).
- `coverage` (diretório de saída do relatório) adicionado ao `.gitignore` — não existia
  antes porque a ferramenta de cobertura não existia.

**Critérios de aceite.**

- [x] Suíte roda sem Electron e sem internet — nenhum `import "electron"` em
  `src/main/http`, `src/main/storage` ou `src/main/importers` (grep confirmado); os
  únicos hosts em URLs nos specs dessas três pastas são `127.0.0.1`/`localhost` (servidor
  local do `engine.spec.ts`) ou domínios fictícios/de exemplo (`example.com`,
  `this-host-does-not-exist.invalid`) usados como dado, nunca conectados de verdade
- [x] Cobertura acima do limiar nas três pastas, verificada de um jeito que seria
  aplicado no CI — `yarn test:coverage` (`vitest run --coverage`) falha o processo
  quando abaixo do limiar, confirmado subindo `lines` para 99% e vendo o erro; a
  ligação num pipeline de CI de fato é EP-10-T03, fora do escopo desta task
- [x] Suíte completa abaixo de 30s — `yarn test`: 486 testes em 55 arquivos, ~3.6s de
  execução total (`time yarn test`)

---

### EP-10-T02 — Testes end-to-end

**Status:** Concluída (verificação de SO limitada ao Linux) · **Tamanho:** M · **Depende de:** EP-10-T01

**Objetivo.** Os fluxos que o usuário realmente percorre não quebram.

**Escopo.**

- Playwright com driver de Electron.
- Fluxos: criar workspace → criar request → enviar → salvar → fechar → reabrir e conferir; trocar environment e reenviar; importar collection do Postman; rodar request com script de teste.
- Poucos e estáveis — E2E não substitui teste unitário.

`@playwright/test` como dependência de desenvolvimento — só o pacote `playwright`/
`@playwright/test` em si; nenhum binário de browser separado foi baixado, porque o
driver `_electron` guia o Chromium já empacotado dentro do próprio app do Wttp via CDP,
não um Chromium do Playwright. `playwright.config.ts` (raiz) aponta `testDir` para
`e2e/`, roda `workers: 1` (cada teste já é um processo Electron inteiro — paralelizar
só multiplicaria CPU/memória sem ganho para quatro fluxos) e liga
`screenshot: "only-on-failure"` + `trace: "retain-on-failure"` (critério "falha produz
screenshot e trace"). `e2e/fixtures.ts` estende `test` do Playwright com um
`userDataDir`/`workspacesRoot` únicos por teste (`node:fs.mkdtempSync`, limpos no
teardown) e uma `electronApp`/`window` já apontando para `out/main/index.js` — o build
de produção (`yarn build`), não o servidor de dev, pela mesma razão do critério de
estabilidade: sem HMR, sem depender de porta livre, o mesmo artefato que
`yarn build:linux` empacota. `--headless=new`/`--disable-gpu` (Chromium nativo do
Electron, não Xvfb) entram só nesses `args` de teste — `src/main/index.ts` de produção
não muda. Este sandbox de dev tem `ELECTRON_RUN_AS_NODE=1` no ambiente (herdado do
próprio Claude Code, que também é um app Electron); sem removê-lo do `env` passado a
`electron.launch()` (`LAUNCH_ENV`, `e2e/fixtures.ts`), o binário do Electron roda como
Node puro e todo `--flag` de Chromium vira "bad option" — problema do sandbox, não do
app, então o fix mora só no launch de teste.

Sem `data-testid` nenhum no app antes desta task — os quatro fluxos precisam de alguns
poucos seletores estáveis que nem `role`/texto visível cobrem sozinhos (o editor de URL
e o corpo de resposta são `WCodeEditor`/CodeMirror, sem `<input>` nativo para
`getByPlaceholder`). Seis atributos `data-testid` adicionados, todos passados como prop
solta num `<WCodeEditor>` (cai no elemento raiz por fallthrough automático do Vue, sem
mexer no componente em si): `request-url-editor` (`RequestUrlBar.vue`),
`import-content-editor` (`ImportModal.vue`), `body-json-editor`/
`script-prerequest-editor`/`script-tests-editor` (`RequestConfigTabs.vue`) e
`response-body-viewer` (`ResponsePanel.vue`). O resto dos fluxos usa `role`/texto real
(`getByRole("treeitem")`, `getByTitle("Manage environments")`, etc.) — sem inventar
seletor onde a UI já é suficientemente identificável.

Dois detalhes descobertos só ao rodar de verdade, sem relação com a task em si mas que
os testes precisaram contornar: `openTab` (`stores/requestTabs.ts`) tem uma corrida real
entre clique (preview) e duplo clique (pinned) na mesma linha da árvore — os dois
disparam sobre o mesmo `await window.wttp.node.read(...)` ainda pendente e nenhum vê a
aba que o outro está prestes a criar, abrindo duas abas para a mesma request; os testes
evitam duplo clique nas linhas da árvore (clique único basta para os quatro fluxos) —
mencionado aqui como achado, não corrigido, fora do escopo desta task. E `WCodeEditor` só emite `update:modelValue` 300ms depois da última tecla por
padrão (`debounceMs`) — os helpers de teste (`fillCodeMirror`, `e2e/helpers.ts`) esperam
esse prazo antes de qualquer ação seguinte, senão uma leitura imediata da store (ex.
Send logo após digitar um script) pega o valor antigo.

Import do Postman reaproveita o padrão de fixture real dos importadores
(`docs/conventions.md`) — `e2e/fixtures/e2e-collection.postman_collection.json`, uma
collection v2.1 mínima (1 request) escrita a mão para este fluxo, não a fixture de
2500 linhas dos testes de importer (`auth0-management-api.postman_collection.json`),
que exigiria digitar isso tudo num `WCodeEditor` via teclado sintético — lento e frágil
sem necessidade, já que o pipeline de import em si já tem cobertura própria em
`main/importers`.

`vitest.config.ts` ganhou `test.exclude: [...configDefaults.exclude, "e2e/**"]` — sem
isso o padrão de include do Vitest (`**/*.spec.ts`) tentaria carregar os specs do
Playwright e quebraria em `import "@playwright/test"`. `package.json` ganhou
`"test:e2e": "playwright test"`.

**Critérios de aceite.**

- [x] Os quatro fluxos passam — verificado rodando `playwright test` neste sandbox
  Linux; **macOS e Windows não verificados aqui** (sem essas plataformas disponíveis),
  fica para a matriz de CI de EP-10-T03, mesmo padrão de "verificação pendente" já usado
  em CLAUDE.md para os épicos com verificação visual adiada
- [x] Sem flakiness em 10 execuções seguidas — `playwright test` rodado 10x seguidas
  neste sandbox: 10/10 passou (4/4 fluxos em cada uma), ~11s por execução
- [x] Falha produz screenshot e trace — verificado quebrando de propósito uma asserção
  em `import-postman.spec.ts`, rodando, confirmando `test-failed-1.png` e `trace.zip`
  em `test-results/`, e revertendo a quebra

---

### EP-10-T03 — Pipeline de CI

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-10-T02

**Objetivo.** Nada quebrado entra na branch principal.

**Escopo.**

- GitHub Actions: lint, typecheck, test e build em Linux, macOS e Windows.
- Cache de dependências; E2E só em push para a principal e em PR marcado.
- Branch protegida exigindo o pipeline verde.

**Critérios de aceite.**

- [ ] PR roda o pipeline completo em menos de 10 minutos
- [ ] Falha em qualquer SO bloqueia o merge
- [ ] Build de instalador é validado, mesmo sem publicar

---

### EP-10-T04 — Onboarding de contribuidores

**Status:** Pendente · **Tamanho:** P · **Depende de:** EP-10-T03

**Objetivo.** Alguém de fora consegue contribuir sem perguntar nada.

**Escopo.**

- `CONTRIBUTING.md`: setup, como rodar, convenções, como pegar uma task do backlog.
- Templates de issue (bug, feature) e de PR com checklist da Definition of Done.
- `CODE_OF_CONDUCT.md` e `LICENSE` (MIT).

**Critérios de aceite.**

- [ ] Um dev sem contexto vai de clone a `yarn dev` seguindo só o `CONTRIBUTING.md`
- [ ] Template de PR referencia o ID da task

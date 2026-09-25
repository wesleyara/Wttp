# Wttp

Cliente HTTP local e open source — desenvolver, testar e documentar APIs. Desktop app (Electron + Vue 3), com workspaces, collections, environments e variáveis persistidos em **arquivos YAML versionáveis** na máquina do usuário.

Visão do produto: [arch-docs/overview.md](arch-docs/overview.md).

---

## Estado do projeto

**Pré-MVP.** A fundação (**EP-01**), o design system/shell (**EP-02**), o núcleo HTTP
(**EP-03**), a persistência em disco (**EP-04**), workspaces/collections/tabs
(**EP-05**) e environments/variáveis (**EP-06**) estão prontos: electron-vite com os
três processos comunicando, IPC tipado, tokens semânticos com dark mode, os
componentes base `W*` (agora também `WModal`, `WTree`, `WContextMenu`), o shell de três
painéis (`WSplitPane`) com tamanhos persistidos, tema com `useSettingsStore`, menu
nativo com atalhos, a engine HTTP (`src/main/http`, todos os métodos e tipos de body,
redirects, timing, cancelamento), `WCodeEditor` (CodeMirror 6), a UI de montar/
disparar/inspecionar uma request (`RequestUrlBar`, `RequestConfigTabs`,
`ResponsePanel`), todo o storage do workspace (`src/main/storage`): parser/serializer
YAML com round-trip byte-a-byte, validação de schema, versionamento e migração, leitura
e escrita atômica da árvore inteira (`node:*`, `workspace:*`), watcher de filesystem que
reflete edições externas na UI sem entrar em loop com o próprio save, segredos de
environment via `safeStorage` do SO com fallback em texto avisado (`src/main/secrets`),
a UI completa de workspace: tela inicial de abrir/criar/recentes (`WorkspaceLanding`),
árvore virtualizada de collections com CRUD/drag & drop/menu de contexto (`WTree`), abas
de request independentes com sessão restaurada (`useRequestTabsStore`,
`.wttp/ui-state.json`) e paleta de busca rápida (`CommandPalette`, `Ctrl+P`), e agora o
resolvedor de `{{variável}}` (`src/main/http/resolver.ts`, precedência
runtime>environment>collection/pasta>workspace>dinâmicas, ciclo detectado, `$uuid`/
`$timestamp`/`$isoTimestamp`/`$randomInt`), CRUD de environments com segredos roteados
para o keychain (`env:*`, `EnvironmentEditorModal`), o seletor de environment ativo no
`StatusBar` persistido por workspace, e realce/tooltip/autocomplete de variável na URL,
params, headers e body — `useRequestTabsStore.send()` resolve a request inteira antes
de disparar e pede confirmação quando sobra alguma `{{var}}` não resolvida.
`useRequestStore` continua uma fachada sobre a aba ativa — nenhum componente de EP-03
precisou mudar. A verificação visual de EP-02/EP-03/EP-05/EP-06 (dois temas, interações
reais numa janela) ainda não foi feita — este ambiente de desenvolvimento não tem
`xvfb`/`sudo` para abrir uma; pendente antes de considerar qualquer um dos quatro
épicos fechado de fato. Ver nota no topo de EP-02
e as notas por task em EP-03,
EP-05 e
EP-06.

**EP-07** (Autenticação) também está pronto: `AuthConfig` (`@shared`) como union por
`type` — `none`/`inherit`/`bearer`/`basic`/`apikey` — já existia desde a preparação de
EP-06 no formato de arquivo e no storage; o que faltava era resolver a herança e
aplicá-la. `resolveAuthChain` (`src/main/http/authInheritance.ts`, puro, exposto via
`variables:resolveAuthChain`) sobe request → pasta → pasta pai → collection até achar
a primeira camada que não seja `inherit`, com `none` cortando a herança explicitamente
e nenhuma auth em lugar nenhum resolvendo em "sem header" sem erro. `applyAuth`
(`src/main/http/auth.ts`) roda no início de `sendHttpRequest` e vira `Authorization:
Bearer`/`Basic <base64 UTF-8>` ou header/query de API key, cedendo a um `Authorization`
manual já presente nos headers. A Aba Auth (`AuthConfigEditor.vue`) existe nos dois
níveis — request (`RequestConfigTabs`) e pasta/collection, esta última pela primeira
vez editável na UI via `FolderAuthModal` (menu de contexto "Edit auth") — com
rascunho por tipo preservado ao trocar, campos secretos mascarados com revelar por
campo, e o modo `inherit` mostrando de onde a auth efetiva vem, não só a palavra
"inherit" (`useEffectiveAuth`). A aba "Auth" de `RequestConfigTabs` carrega um badge
com o tipo efetivo (`WTabs` ganhou `badge`/`warning` por aba) e acende aviso quando a
auth (própria ou herdada) depende de `{{var}}` não resolvida — o mesmo fluxo de
confirmação de EP-06-T05 cobre isso antes do envio, sem UI nova. Os três tipos de auth
foram verificados só por teste unitário, não contra um servidor de teste real — não há
harness de servidor HTTP de integração no repo, registrado como pendência em
EP-07. Mesma pendência de verificação visual das
notas acima.

**EP-06.1** (não planejado, aberto após feedback de uso real) também está pronto:
`@iconify/vue` com o set Lucide empacotado offline (`WIcon`, sem SVG duplicado nos
componentes), os bugs de `WKeyValueTable` (linha fantasma criando linhas vazias ao
marcar o checkbox, watcher de Content-Type sobrescrevendo header ao trocar o tipo de
body) corrigidos, path params (`:nome` na URL) separados de query params com campo
novo no formato de arquivo (`pathParams`, resolvido pelo `resolver.ts` antes de
`{{var}}`), highlight/tooltip de variável estendido a Docs/environments/body
urlencoded/multipart, sistema de toast (`useToastStore`/`WToast`) cobrindo save/
create/delete em request, folder, environment e linhas de tabela, zebra striping via
o token `stripe` (novo em `arch-docs/design-system.md`), a árvore sincronizando após
salvar uma aba, e diretório padrão de workspace configurável (`defaultWorkspaceDir`).
Mesma pendência de verificação visual das notas acima.

**EP-09** (Scripts e testes) também está pronto, implementado fora da ordem recomendada
do backlog — EP-08 (Importadores) ainda estava `Pendente` na época, mas scripts não têm
acoplamento funcional com importadores, decisão explícita do usuário. Código de usuário
roda isolado num `utilityProcess` + `node:vm` (`src/main/scripts`, sem `require`/
`process`/`fs`/`net` no contexto, timeout com backstop e recuperação de crash sem
restart do app — `runner.ts`/`sandbox.ts`/`worker.ts`), com a API `wttp.setVar/getVar`
(environment ativo) e `wttp.setCollectionVar/getCollectionVar` (collection da request) —
os dois pares gravam no YAML em disco assim que o script termina (`persistEnvVars`/
`persistCollectionVars` em `requestTabs.ts`, via `env:save`/`node:write`), nunca
sobrescrevem uma variável `secret: true`, e falham com mensagem clara sem environment
ativo/collection — mais `req` mutável, `res` congelada, `test`/`expect` com os seis
matchers documentados e `console.*` capturado (`api.ts`, `arch-docs/scripting.md`). A
integração no fluxo da request (`useRequestTabsStore.dispatch`) roda a cadeia de
pre-request de fora pra dentro (collection → pasta → request) antes do envio e a de
tests de dentro pra fora depois, threadando o mesmo escopo de env/collection vars entre
os elos — é o que faz "login guarda token, request seguinte autentica sozinha"
funcionar (o token cai no environment ativo, que já é a fonte natural de `{{token}}`);
falha no pre-request aborta o envio com mensagem clara. `folder.yaml` ganhou um campo `scripts` opcional para
herança de collection/pasta, editável tanto na request (`RequestConfigTabs`) quanto na
pasta/collection (`FolderConfigTabs`) — os dois com dois `WCodeEditor` (pre-request/
tests), autocomplete da API inteira, snippets e sinalização de erro de sintaxe via
`@codemirror/lint`. `ResponsePanel` ganhou
a aba Tests (`ScriptResultsPanel`) com asserções passou/falhou e o console de scripts
por fase, e o `StatusBar` mostra um resumo de falhas da aba ativa. `@codemirror/lint`
segue como dependência transitiva (via `codemirror`/`@codemirror/lang-javascript`) — não
foi possível promovê-la a direta no `package.json` porque `yarn install` neste ambiente
falha num `@babel/generator` que exige Node mais novo, problema de ambiente sem relação
com o épico. Mesma pendência de verificação visual das notas acima.

**EP-08** (Importadores) também está pronto: Postman Collection v2.1 (com environment),
Insomnia v4, OpenAPI 3.x e cURL (`src/main/importers`, um módulo por formato sobre o
pipeline comum `parse → normalize → emit` de EP-08-T01), a UI de import na tela sem
workspace aberto (`ImportModal`, sempre cria um workspace novo) e, por último,
**EP-08-T07**: import direto num workspace já aberto, via item "Import" no menu "+" da
toolbar da árvore (`AppShell.vue`), ao lado de "New collection"/"New folder"/
"New request". Sempre grava na raiz do workspace aberto (`targetPath: ""`), como uma
collection nova — a raiz de um workspace só pode conter collections e uma collection
nunca fica dentro de outra (nem de uma pasta), então não existe "importar pra dentro de
uma pasta escolhida" nem menu de contexto de pasta para isso; `useImportStore` ganhou
um segundo modo (`intoWorkspace`, ao lado do `newWorkspace` de EP-08-T06) que só troca
o destino do mesmo `import:run`/`runImport`/`emitImport` de sempre — nenhuma mudança
de infraestrutura no pipeline, e como a raiz nunca tem uma pasta pra colidir (mesmo
motivo por que "New collection" clicado duas vezes nunca pergunta nada), não há
resolução de conflito nem passo extra no modal. Mesma pendência de verificação visual
das notas acima.

**EP-09.1** (Produtividade de tabs/sidebar e ferramenta JWT, não planejado, aberto após
uso real do app) também está pronto: menu de contexto na barra de abas com "Fechar
outras"/"Fechar todas" (`RequestTabsBar.vue`, `closeAll`/`closeOthers` em
`stores/requestTabs.ts`, confirmação de aba suja encadeada uma por vez via uma fila —
cancelar no meio interrompe o lote sem fechar o resto), largura de tab fixa
(`w-44 shrink-0`, corrigindo o "pulo" durante drag-reorder), seleção múltipla na árvore
com Ctrl/Cmd+click (`WTree.vue`/`stores/tree.ts`, `selectedPaths: Set<string>` ao lado
do `selectedPath` "ativo" já existente, arrastar qualquer item da seleção move o grupo
inteiro para o fim do destino), "Mover para..."/"Copiar para..." no menu de contexto da
árvore (`MoveCopyModal.vue`, lista achatada de pastas/collections com destino inválido
desabilitado — self/descendente, ou uma collection para dentro de qualquer pasta, já
que uma collection nunca é aninhada), `WCodeEditor` com a prop `autoGrow` (cresce com o
conteúdo até um `maxHeight` opcional, usada no body JSON/raw e na aba Docs de request e
pasta/collection — Scripts e demais editores continuam com altura fixa), e a ferramenta
JWT (`JwtToolModal.vue`, aberta pelo `StatusBar`) com Decode puro (base64url +
`TextDecoder`, qualquer algoritmo) e Encode HS256 assinado via `crypto.subtle` do
renderer, sem `node:crypto` nem canal IPC novo. "Copiar para..." precisou de um canal
não previsto no escopo original — `node:copyInto` (`src/main/storage/tree.ts`,
`src/main/ipc/node.ts`) — porque `duplicateNode` só duplicava dentro da mesma pasta;
coberto por teste em `tree.spec.ts` (request solto, colisão de nome, pasta com filhos,
guarda contra copiar para dentro de si mesma). Mesma pendência de verificação visual
das notas acima.

**EP-10-T01** (Suíte de testes do núcleo, dentro de EP-10 — Qualidade e CI) está pronto;
as outras três tasks do épico (E2E, pipeline de CI, onboarding) seguem `Pendente`. A
cobertura de `main/http`, `main/storage` e `main/importers` já era substancial antes
desta task — engine HTTP contra um `http.createServer` local cobrindo todos os tipos de
body/redirects/timeout/cancelamento/erro de rede/timing, round-trip byte a byte dos
quatro tipos de arquivo, escrita atômica testada (falha no meio preserva o original,
edição externa concorrente é detectada) e fixture real + snapshot para Postman/
Insomnia/OpenAPI. O que faltava: cURL era o único importador sem fixture real (agora
`src/main/importers/__fixtures__/github-get-repo.curl.txt`, copiado da documentação da
GitHub, com teste de snapshot em `curl.integration.spec.ts`), `activeWorkspace.ts`
estava em 0% de cobertura (`src/main/storage/activeWorkspace.spec.ts` novo), e o laço de
encadeamento de migradores em `migrations/registry.ts` nunca era exercitado (caso novo
em `registry.spec.ts`). `@vitest/coverage-v8` entrou como dependência de
desenvolvimento e `vitest.config.ts` ganhou `test.coverage` (`provider: "v8"`, limitado
a essas três pastas) com limiares de 85% linhas/statements e 80% funções/branches —
`yarn test:coverage` falha o processo se cair abaixo, confirmado empiricamente; a
cobertura real após o gap-filling ficou em ~92-96%. A suíte inteira roda sem Electron e
sem rede externa (nenhum `import "electron"` nem hostname real fora de
`127.0.0.1`/`localhost` nos specs dessas três pastas) e completa em ~3.6s para 486
testes, bem abaixo do limite de 30s do critério de aceite. Ligar isso a um pipeline de
CI de verdade é EP-10-T03, ainda não feito.

**EP-10-T02** (Testes end-to-end) também está pronto: Playwright com o driver de
Electron (`_electron`), guiando o Chromium já empacotado dentro do próprio `out/main/
index.js` (build de produção, `playwright.config.ts` na raiz) — não um Chromium baixado
à parte, então `playwright install` nunca foi necessário. `e2e/fixtures.ts` isola cada
teste num `userDataDir`/workspace próprios (`node:fs.mkdtempSync`) e remove
`ELECTRON_RUN_AS_NODE` do `env` do processo lançado — só um problema deste sandbox de
dev (herdado do processo host, ele mesmo Electron), sem relação com o app;
`--headless=new`/`--disable-gpu` entram só nesse `args` de teste, nunca em `src/main/
index.ts`. Os quatro fluxos do escopo (criar → enviar → salvar → fechar → reabrir;
trocar environment e reenviar; importar Postman; request com script de teste) vivem em
`e2e/*.spec.ts`, com seis `data-testid` novos nos `WCodeEditor` que não têm `role`/
`placeholder` suficiente para um seletor estável (URL bar, corpo JSON, os dois editores
de script, corpo da resposta, conteúdo colado no import) — o resto usa `role`/texto real
da UI. Dois achados ao rodar de verdade, sem relação com a task em si: `openTab`
(`stores/requestTabs.ts`) tem uma corrida real entre clique e duplo clique na mesma
linha da árvore, capaz de abrir duas abas para a mesma request — os testes evitam duplo
clique nas linhas e o achado fica registrado aqui, não corrigido; e `WCodeEditor` só
emite `update:modelValue` 300ms depois da última tecla (`debounceMs`), então os helpers
de teste esperam esse prazo antes de agir em cima do valor digitado.
`vitest.config.ts` ganhou `exclude: [...configDefaults.exclude, "e2e/**"]` para o
Vitest nunca tentar carregar os specs do Playwright. Os quatro fluxos passaram 10/10
execuções seguidas neste sandbox Linux (~11s cada) e a checagem de screenshot+trace em
falha foi confirmada quebrando uma asserção de propósito; **macOS e Windows não foram
verificados** (sandbox só tem Linux) — fica para a matriz de CI de EP-10-T03, mesma
pendência de verificação já registrada nos épicos com verificação visual adiada acima.

**EP-10-T03** (Pipeline de CI) também está pronto, com uma ressalva. `.github/workflows/
ci.yml` tem três jobs: `quality` (matriz `ubuntu-latest`/`macos-latest`/`windows-latest`,
`yarn lint` → `typecheck` → `test`), `build` (mesma matriz, `yarn build:linux`/`build:mac`/
`build:win` — valida que o instalador empacota em cada SO, sem publicar em lugar nenhum)
e `e2e` (só em `push` para `main` ou PR com a label `run-e2e`, builda com `yarn build` e
roda `yarn test:e2e` como EP-10-T02 já exige). Cache de dependência via `actions/
setup-node`'s `cache: yarn`, sem `actions/cache` manual. No caminho, `yarn lint` estava
quebrado na ponta de `develop` antes desta task — `docs/.vitepress/cache/` (cache do dev
server do VitePress) tinha sido commitado por engano, e o scaffold padrão do VitePress
(`docs/.vitepress/config.mts`/`theme/index.ts`) nunca tinha sido alinhado às regras de
lint do projeto; ambos consertados (`.gitignore`, `eslint.config.mjs`) porque sem isso a
pipeline nunca ficaria verde. **Proteção de branch não foi aplicada** — é uma
configuração do repositório no GitHub (Settings → Branches), não um arquivo versionado, e
mudar controle de acesso compartilhado não é algo que um agente deva fazer sem um humano
decidindo; os passos exatos (quais status checks marcar como obrigatórios, com os nomes
que saem do workflow) ficam documentados em
EP-10 como pendência
explícita do dono do repositório. "PR roda em menos de 10 minutos" também não foi
verificado com um run real do GitHub Actions (sem `gh` CLI neste sandbox) — só por um
proxy local (`lint`+`typecheck`+`test`+`build` sequencial, ~20s neste sandbox Linux),
registrado no épico com a mesma ressalva.

**EP-10-T04** (Onboarding de contribuidores), a última task do épico, também está
pronto: `CONTRIBUTING.md` na raiz leva um contribuidor novo de `git clone` a `yarn dev`
sem depender de nada fora do próprio arquivo, lista os comandos (`lint`/`typecheck`/
`test`/`test:coverage`/`test:e2e`/`build`), explica como escolher o que fazer (hoje via GitHub Issues; antes, o backlog
removido) e ler o escopo inteiro — inclusive o **fora de escopo** — antes de codar, resume as regras de
`arch-docs/conventions.md` que mais pegam quem chega de fora (renderer nunca importa
`node:*`/`electron`, só tokens semânticos de cor, YAML é contrato público, docs em
PT-BR e código/commits/PRs em inglês) e fecha com a Definition of Done. Templates novos
em `.github/`: `ISSUE_TEMPLATE/bug_report.md`, `ISSUE_TEMPLATE/feature_request.md` e
`PULL_REQUEST_TEMPLATE.md` — este último abre com `Refs <!-- EP-XX-TYY -->` antes de
qualquer outro campo, e repete o checklist da Definition of Done com espaço para colar
os critérios de aceite da task. `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) e
`LICENSE` (MIT, copyright `wesleyara` — o autor em `package.json`) na raiz.

Com isso **EP-10 está concluído**, com uma única pendência explícita e fora do alcance
de qualquer agente neste ambiente: a proteção de branch do GitHub (EP-10-T03) precisa
ser aplicada manualmente pelo dono do repositório, passos documentados em
EP-10.

**EP-11** (Empacotamento e distribuição) também está pronto, com pendências explícitas
fora do alcance de qualquer agente neste ambiente. `electron-builder.yml` preenchido de
verdade: `dmg` explícito para `x64`+`arm64` no macOS, `nsis` explícito no Windows,
categoria macOS (`public.app-category.developer-tools`), `fileAssociations` para
`.wttp.yaml` (funciona em Windows/macOS; o Linux rejeita extensão com ponto no gerador
de mime-type do próprio electron-builder — limitação real da ferramenta, não algo a
contornar), e o bloco `files` cortando `docs/`/`arch-docs/`/`e2e/`/`.claude/`/configs de dev que
antes vazavam inteiros para dentro do `app.asar` (confirmado inspecionando o asar antes/
depois). Assinatura de código e notarização (EP-11-T02) ficam atrás de cinco secrets
opcionais do CI (`CSC_LINK`/`CSC_KEY_PASSWORD`/`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/
`APPLE_TEAM_ID`, documentados com custo real em [arch-docs/release.md](arch-docs/release.md)) —
sem eles o build sai sem assinar, sem erro. Auto-update via `electron-updater`
(`src/main/update/updater.ts`) checa no boot e a cada 4h (respeitando
`AppSettings.autoUpdateEnabled`, novo), baixa em background e só troca o binário no
próximo restart natural ou com um clique explícito em "Update now" — nunca sozinho no
meio de uma sessão; `.deb` nunca checa (detecta `resources/package-type`, escrito só
pelo electron-builder para pacotes de gerenciador), a aba Updates das Preferences
explica por quê. `.github/workflows/release.yml` publica pra GitHub Releases como
rascunho (`releaseType: draft`) ao empurrar uma tag `v*`, com changelog agrupado por
Conventional Commits — achado sério no caminho: `publish: {provider: github}` fazia o
job `build` do CI _normal_ (sem tag, sem token) tentar publicar sozinho por causa da
política implícita `onTagOrDraft` do electron-builder sob CI, quebrando o build;
corrigido com `build:<os>` sempre `--publish never` e um `release:<os>` novo, só usado
pelo workflow de release, sempre `--publish always`. `examples/postman-echo-demo/` é um
workspace de exemplo de verdade (não fixture) exercitando collections, environments,
auth herdada e um fluxo login→bearer via scripts, verificado rodando as cinco requests
de verdade contra `postman-echo.com`; as duas screenshots do `README.md`
(`arch-docs/screenshots/`, removidas depois do README) eram capturas reais do app rodando (`Page.screenshot()` do
Playwright contra o Chromium headless empacotado, tema trocado pelo botão de verdade da
UI) — descoberta importante: ao contrário do que as notas de EP-02/EP-03/EP-05/EP-06/
EP-07 registram, o Chromium headless do Electron renderiza e tira screenshot sem X11
nenhum neste sandbox, só não abre uma janela _visível_; fica como nota para o dono do
repositório reconsiderar aquelas pendências de verificação visual, não revisitado aqui.
**Pendências reais, não contornáveis**: nenhuma tag foi criada (criar uma publica um
release real, ainda que rascunho — decisão do dono do repositório), então "update
ponta a ponta com release real" e "pipeline de release disparado de verdade" seguem
não verificados; e instalação/abertura limpa em Windows e macOS segue impossível neste
sandbox só-Linux, mesma pendência multi-SO já registrada em EP-10. Detalhes por task em
EP-11.

**EP-08.1-T06/T07** (i18n e documentação de usuário, fecham o EP-08.1) também estão
prontos. `vue-i18n` com `en` (fonte e fallback) e `pt-BR` (`src/renderer/src/i18n/`,
`pt-BR.ts` tipado como `MessageSchema` — chave faltando quebra o `typecheck`;
`i18n.spec.ts` confere placeholders), `AppSettings.language` (`system`/`en`/`pt-BR`),
seletor em Preferências → General com troca na hora, todos os `.vue` (menos
`DevGalleryPage`) e os toasts/mensagens das stores via `t()`/`i18n.global.t()`; regra nova
em `arch-docs/conventions.md` ("nenhuma string de UI literal"). Fora: rótulos do menu **nativo**
e `WttpError` do main, ainda em inglês. `e2e/fixtures.ts` agora fixa `language: "en"` no
`settings.json` de cada teste — sem isso os e2e dependeriam do idioma do SO. Docs de
usuário em VitePress, **só de produto** (`docs/guia/**` pt-BR, `docs/en/guide/**`; os
documentos de engenharia moraram em `docs/` e foram movidos para `arch-docs/` — o site
nunca os enxerga),
`yarn docs:build`, site público na Vercel (`vercel.json`; antes GitHub Pages, removido), e — a pedido do
usuário — uma cópia **empacotada no app** (`yarn docs:build:offline` → `resources/docs-site`,
janela via protocolo `wttp-docs:`, `app:openDocs`, item Help → Documentation), verificada
num Electron headless (`e2e/language-and-docs.spec.ts`). `vitepress` foi para
`devDependencies`. **Pendências reais:** o projeto na Vercel precisa ser criado pelo dono do repositório, e o
link online (menu Help, Preferências, README) ainda aponta para o antigo GitHub Pages até
existir o domínio; verificação visual de pt-BR nos dois temas e um `build:linux` completo com a doc
dentro do instalador não foram feitos. Detalhes em
EP-08.1.

**EP-13** (Collection Runner e CLI, pós-MVP, v0.2) também está pronto, feito pelo card #32
do ClickLocal. Núcleo de execução em `src/main/runner/` (sem Electron: envio, scripts e
segredos entram por `RunnerDeps`) que repete o `dispatch()` do envio avulso — herança de
auth, `{{var}}`, cadeia de pre-request, envio, cadeia de tests — e o estende com plano
(ordem da árvore ou seleção reordenada), iterações, intervalo, `bail`, Stop e gravação
opcional das variáveis no fim. Na UI: aba singleton `runner` (`RunnerPanel.vue`,
`useRunnerStore`, canais `runner:start`/`runner:stop` + evento `runner:event`), aberta por
"Run…" no menu de pasta/collection ou pela busca rápida. No terminal: `wttp run`
(`src/cli/`, `yarn build:cli` → `cli/dist/wttp.mjs`, pacote npm `wttp-cli` em `cli/`),
reporters `cli`/`json`/`junit`, exit 0/1/2, segredos por `WTTP_SECRET_<NOME>` mascarados
em toda saída; o processo de scripts virou um host genérico (`src/main/scripts/host.ts`)
sobre `utilityProcess` no app e `child_process.fork` (`serialization: "advanced"`) no CLI.
`scripts/cli-smoke.mjs` roda o binário sem Electron/display no job `quality` (ubuntu) do
CI; `action.yml` na raiz é a GitHub Action; doc de usuário em `docs/guia/runner-e-ci.md`.
**Pendências reais:** publicar `wttp-cli` no npm e a Action (tag `v1`), e testar JUnit/Action
num CI real — ações do dono do repositório.

**Card #63** (changelog e releases, abertura como open source) também está pronto.
Histórico reescrito sem os trailers `Co-Authored-By`/`Claude-Session` e com autor único;
versões retroativas por tag anotada — `v0.1.0` (fim do MVP), `v0.2.0` (Runner/CLI) e
`v0.3.0` (primeiro `chore(release)`) — e `CHANGELOG.md` na raiz, em inglês, com essas três
seções curadas à mão e as próximas geradas pelo git-cliff (`cliff.toml`) via
`yarn release <versão>` (`scripts/release.mjs`, `scripts/changelog.mjs`). O site de docs
mostra o mesmo arquivo em `/changelog` e `/en/changelog`; `release.yml` usa a seção da
versão como corpo do release, builda Linux+Windows (macOS só via `workflow_dispatch`) e
tem guarda para as tags retroativas — que mesmo assim precisam ser empurradas com o Actions
desligado, porque o push de tag roda o workflow antigo do commit taggeado. Fluxo em [arch-docs/release.md](arch-docs/release.md).

**Card #64** (CRLF no Windows): toda escrita de YAML do storage passa por
`writeYamlAtomic` (`src/main/storage/eol.ts`), que regrava um arquivo existente com a
quebra de linha que ele já tinha (CRLF se a primeira linha termina em `\r\n`) e cria
arquivos novos em LF; duplicar herda a do original. Cobre o checkout do Windows com
`core.autocrlf=true` sem quebrar "salvar sem alterar produz bytes idênticos"
(arch-docs/file-format.md §6.2). O parser já normalizava CRLF na leitura. Não cria
`.gitattributes` nos workspaces do usuário (opção 2 do card, fora de escopo).

Com isso o **MVP (v0.1) está funcionalmente completo** — EP-01 a EP-11 prontos, com as
pendências de verificação (visual multi-tema numa janela de verdade, multi-SO, e a
primeira release real) explicitamente registradas em cada épico, não escondidas.
Trabalho corrente: board "Wttp mcp" do ClickLocal (o `arch-docs/backlog/` foi removido; os IDs
`EP-XX` citados acima são históricos, sem arquivo correspondente).

---

## Estrutura

```
src/
├── main/        Node — HTTP engine, storage, scripts, importers, IPC
├── preload/     bridge contextBridge — única superfície do renderer
├── renderer/    Vue 3 + Pinia — só UI e estado
├── shared/      tipos do contrato IPC (sem runtime)
└── cli/         `wttp run` (EP-13-T02) — Node puro, reusa src/main/runner
cli/             pacote npm `wttp-cli` (dist gerado por `yarn build:cli`)
arch-docs/       referência técnica (engenharia; nunca vai pro site)
docs/            site de documentação de usuário (VitePress, só produto)
.claude/skills/  skills dos fluxos repetitivos
```

Aliases: `@renderer` → `src/renderer/src`, `@shared` → `src/shared`.

---

## Comandos

```sh
yarn                 # instalar
yarn dev             # Electron + Vite com HMR + VitePress da doc (porta 5174)
yarn dev:app         # só o Electron
yarn lint            # ESLint
yarn typecheck       # typecheck:node + typecheck:web
yarn test            # Vitest
yarn build           # bundle dos três processos
yarn build:linux     # instalador (também :win, :mac)
yarn build:cli       # CLI `wttp run` → cli/dist (smoke: node scripts/cli-smoke.mjs)
yarn release minor   # patch/minor/major: CHANGELOG.md + bump + commit + tag (arch-docs/release.md)
```

---

## Regras críticas

1. **O renderer nunca importa `node:*` nem `electron`.** Todo I/O passa por `window.wttp.*`. Precisa de algo novo? Novo canal IPC — use a skill `wttp-ipc-channel`.
2. **Nenhuma cor crua em componente.** Só tokens semânticos (`bg-surface-2`, `text-muted`). Ver [arch-docs/design-system.md](arch-docs/design-system.md).
3. **O formato em disco é contrato público.** Qualquer mudança passa por [arch-docs/file-format.md](arch-docs/file-format.md) primeiro. Serialização é determinística — salvar sem alterar nada produz bytes idênticos.
4. **Segredos nunca em YAML.** Keychain do SO, com fallback em `.wttp/` (gitignored).
5. **Scripts de usuário rodam isolados** em `utilityProcess` + `node:vm` com timeout. Nunca no main, nunca no renderer.
6. **Docs em PT-BR, código e UI em inglês.**
7. **Commits sem trailers de ferramenta.** Nada de `Co-Authored-By: Claude`/`Claude-Session` — o histórico foi limpo para a abertura open source. O assunto do commit vira linha do `CHANGELOG.md`: escreva para o usuário.

---

## Referência

| Documento                                          | Conteúdo                                          |
| -------------------------------------------------- | ------------------------------------------------- |
| [arch-docs/overview.md](arch-docs/overview.md)               | visão do produto                                  |
| [arch-docs/getting-started.md](arch-docs/getting-started.md) | do download à primeira requisição (usuário final) |
| [arch-docs/architecture.md](arch-docs/architecture.md)       | processos, contrato IPC, fluxo de uma requisição  |
| [arch-docs/file-format.md](arch-docs/file-format.md)         | especificação do YAML em disco                    |
| [arch-docs/design-system.md](arch-docs/design-system.md)     | paleta, tokens, tipografia, componentes base      |
| [arch-docs/conventions.md](arch-docs/conventions.md)         | código, estado, lint, testes, git                 |
| [arch-docs/release.md](arch-docs/release.md)                 | assinatura, notarização e processo de release     |

## Skills

| Skill                | Quando                                                  |
| -------------------- | ------------------------------------------------------- |
| `wttp-task`             | executar uma task do backlog por ID explícito (`EP-XX-TYY`) |
| `wttp-clicklocal-task`  | executar uma task/card do board ClickLocal "Wttp mcp" — desde 2026-09-23, é o que "a task N" significa por padrão |
| `wttp-vue-component`    | criar ou editar componente/página Vue                   |
| `wttp-ipc-channel`      | adicionar ou alterar comunicação main↔renderer          |
| `wttp-file-format`      | ler, gravar ou migrar arquivos de workspace             |
| `wttp-importer`         | adicionar importador (Postman, Insomnia, OpenAPI, cURL) |

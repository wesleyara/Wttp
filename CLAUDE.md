# Wttp

Cliente HTTP local e open source — desenvolver, testar e documentar APIs. Desktop app (Electron + Vue 3), com workspaces, collections, environments e variáveis persistidos em **arquivos YAML versionáveis** na máquina do usuário.

Visão do produto: [docs/overview.md](docs/overview.md).

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
épicos fechado de fato. Ver nota no topo de [EP-02](docs/backlog/EP-02-design-system.md)
e as notas por task em [EP-03](docs/backlog/EP-03-nucleo-http.md),
[EP-05](docs/backlog/EP-05-workspaces-collections.md) e
[EP-06](docs/backlog/EP-06-environments-variaveis.md).

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
[EP-07](docs/backlog/EP-07-autenticacao.md). Mesma pendência de verificação visual das
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
o token `stripe` (novo em `docs/design-system.md`), a árvore sincronizando após
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
matchers documentados e `console.*` capturado (`api.ts`, `docs/scripting.md`). A
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
dev (herdado do próprio Claude Code, que também é Electron), sem relação com o app;
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
[EP-10](docs/backlog/EP-10-qualidade-ci.md#ep-10-t03--pipeline-de-ci) como pendência
explícita do dono do repositório. "PR roda em menos de 10 minutos" também não foi
verificado com um run real do GitHub Actions (sem `gh` CLI neste sandbox) — só por um
proxy local (`lint`+`typecheck`+`test`+`build` sequencial, ~20s neste sandbox Linux),
registrado no épico com a mesma ressalva.

Trabalho corrente: [docs/backlog/README.md](docs/backlog/README.md) → dentro de EP-10,
falta só T04 (onboarding).

---

## Estrutura

```
src/
├── main/        Node — HTTP engine, storage, scripts, importers, IPC
├── preload/     bridge contextBridge — única superfície do renderer
├── renderer/    Vue 3 + Pinia — só UI e estado
└── shared/      tipos do contrato IPC (sem runtime)
docs/            referência técnica e backlog
.claude/skills/  skills dos fluxos repetitivos
```

Aliases: `@renderer` → `src/renderer/src`, `@shared` → `src/shared`.

---

## Comandos

```sh
yarn                 # instalar
yarn dev             # Electron + Vite com HMR
yarn lint            # ESLint
yarn typecheck       # typecheck:node + typecheck:web
yarn test            # Vitest
yarn build           # bundle dos três processos
yarn build:linux     # instalador (também :win, :mac)
```

---

## Regras críticas

1. **O renderer nunca importa `node:*` nem `electron`.** Todo I/O passa por `window.wttp.*`. Precisa de algo novo? Novo canal IPC — use a skill `wttp-ipc-channel`.
2. **Nenhuma cor crua em componente.** Só tokens semânticos (`bg-surface-2`, `text-muted`). Ver [docs/design-system.md](docs/design-system.md).
3. **O formato em disco é contrato público.** Qualquer mudança passa por [docs/file-format.md](docs/file-format.md) primeiro. Serialização é determinística — salvar sem alterar nada produz bytes idênticos.
4. **Segredos nunca em YAML.** Keychain do SO, com fallback em `.wttp/` (gitignored).
5. **Scripts de usuário rodam isolados** em `utilityProcess` + `node:vm` com timeout. Nunca no main, nunca no renderer.
6. **Docs em PT-BR, código e UI em inglês.**

---

## Referência

| Documento                                        | Conteúdo                                         |
| ------------------------------------------------ | ------------------------------------------------ |
| [docs/overview.md](docs/overview.md)             | visão do produto                                 |
| [docs/architecture.md](docs/architecture.md)     | processos, contrato IPC, fluxo de uma requisição |
| [docs/file-format.md](docs/file-format.md)       | especificação do YAML em disco                   |
| [docs/design-system.md](docs/design-system.md)   | paleta, tokens, tipografia, componentes base     |
| [docs/conventions.md](docs/conventions.md)       | código, estado, lint, testes, git                |
| [docs/backlog/README.md](docs/backlog/README.md) | épicos e tasks                                   |

## Skills

| Skill                | Quando                                                  |
| -------------------- | ------------------------------------------------------- |
| `wttp-task`          | executar uma task do backlog (`EP-XX-TYY`)              |
| `wttp-vue-component` | criar ou editar componente/página Vue                   |
| `wttp-ipc-channel`   | adicionar ou alterar comunicação main↔renderer          |
| `wttp-file-format`   | ler, gravar ou migrar arquivos de workspace             |
| `wttp-importer`      | adicionar importador (Postman, Insomnia, OpenAPI, cURL) |

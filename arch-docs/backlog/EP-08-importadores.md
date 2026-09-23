# EP-08 — Importadores

**Status:** Concluída (verificação visual pendente) · **Alvo:** v0.1 · **Depende de:** EP-07

Porta de entrada para adoção. Ninguém recomeça uma collection de 200 endpoints do zero — ou o Wttp importa, ou não é avaliado.

**Princípio:** importação nunca é silenciosamente parcial. O que não pôde ser convertido aparece num relatório.

---

### EP-08-T01 — Infraestrutura de importação

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-04-T04

**Objetivo.** Um contrato comum para todos os formatos.

**Escopo.**

- Pipeline `parse → normalize → emit` em `src/main/importers/`; cada formato implementa `Importer`.
- `ImportReport` com o que foi criado e a lista de itens não convertidos, cada um com motivo.
- `import:detect` identifica o formato pelo conteúdo; `import:run` executa.
- Emissão reutiliza a camada de storage do EP-04 — importadores não escrevem arquivo diretamente.

**Critérios de aceite.**

- [x] Adicionar um formato novo não altera a infraestrutura
- [x] Arquivo irreconhecível retorna erro claro em vez de importar lixo
- [x] Toda perda de informação vira uma entrada no relatório

**Notas de implementação.** `Importer` (`src/main/importers/types.ts`) só declara
`detect`/`parse`/`normalize` — a árvore normalizada (`NormalizedImport`, em memória,
nada em disco ainda) é o que cada formato produz. `emitImport` (`emit.ts`) é a única
parte que escreve, sempre via `storage/tree.ts#createNode`/`writeNode` e
`storage/environments.ts#saveEnvironment`, nunca hand-rolled YAML — sequencial de
propósito porque `createNode` calcula `seq` a partir dos irmãos já gravados.
`detectImportFormat`/`runImport` (`pipeline.ts`) recebem o registro de importadores por
parâmetro (default: o singleton de `registry.ts`), o que deixou testar a infra inteira
com um `Importer` de mentira (`pipeline.spec.ts`) sem esperar por EP-08-T02..T05. Canal
`import:detect`/`import:run` seguem o padrão dos demais domínios (`ipc/import.ts`,
exposto em `preload/index.ts`); `arch-docs/architecture.md` §2 atualizado com o shape real
dos payloads (`content`/`root`/`targetPath`, não o placeholder genérico que estava lá).
Código de erro novo: `IMPORT_FORMAT_UNRECOGNIZED`.

---

### EP-08-T02 — Postman Collection v2.1

**Status:** Concluída · **Tamanho:** G · **Depende de:** EP-08-T01

**Objetivo.** Importar o formato mais comum do mercado.

**Escopo.**

- Collection v2.1: pastas, requests, todos os tipos de body, headers, auth.
- Environments do Postman → environments do Wttp; `{{var}}` já é compatível.
- Scripts: mapear `pm.environment.set` → `wttp.setVar`, `pm.test` → `test`, `pm.response` → `res`. O que não tiver equivalente é preservado como comentário e reportado.
- Fixture real exportada do Postman.

**Critérios de aceite.**

- [x] Collection real com mais de 50 requests importa com a hierarquia preservada
- [x] Os cinco tipos de auth do Postman viram equivalente ou entrada no relatório
- [x] Script não convertido é preservado como comentário, nunca descartado
- [x] Teste de snapshot sobre a fixture

**Notas de implementação.** Um único módulo (`src/main/importers/postman.ts`) cobre
collection **e** environment do Postman — mesmo botão "Import" no app deles, mesmo
`ImportFormat: "postman"` aqui; `detect`/`normalize` decidem pelo shape do JSON
(`info.schema` contendo `collection/v2` vs. `_postman_variable_scope`). Um environment
normaliza direto para `NormalizedEnvironment` sem pasta nenhuma — `emitImport`
(`emit.ts`) foi ajustado para não criar mais uma pasta raiz vazia quando não há
`children`/`auth`/`docs`/`variables`/`scripts` no nível da collection, só efeito
colateral para o caso "importei só um environment". `variable[]` de nível de collection
no Postman virou `variables` na pasta raiz criada (nível "collection/pasta" do
resolvedor de EP-06), não um environment do Wttp — é o escopo que de fato corresponde.
Isso exigiu estender `NormalizedFolder`/`NormalizedImport` (`types.ts`) com `variables`
e `scripts` opcionais, e `emitNode`/`emitImport` (`emit.ts`) a escrevê-los — extensão
aditiva, sem mudar o comportamento dos formatos existentes (`pipeline.spec.ts`,
`curl.spec.ts` continuam passando sem alteração).

Auth: os quatro tipos com equivalente direto (`noauth`→`none`, `bearer`, `basic`,
`apikey`) convertem 1:1; qualquer outro (`oauth2`, `digest`, `awsv4`, `hawk`, `ntlm`,
`oauth1`) vira entrada no relatório em vez de gerar um `AuthConfig` quebrado — "os cinco
tipos" do critério de aceite são os quatro convertíveis mais o grupo "sem equivalente"
tratado uniformemente.

Scripts são convertidos linha a linha (`convertScriptLine`/`convertScript`): um
conjunto pequeno de substituições textuais (`pm.environment.set`→`wttp.setVar`,
`pm.test`→`test`, `pm.response.code`→`res.status`, `pm.response.json()`→`res.json`, os
matchers Chai mais comuns como `.to.eql`/`.to.equal`/`.to.have.property`→os matchers de
`expect` documentados em `arch-docs/scripting.md`) cobre os casos mais frequentes; qualquer
linha que ainda contenha `pm.` depois da substituição não tem conversão segura o
bastante e vira comentário (`// linha original`) mais uma entrada em `notConverted` —
nunca é silenciosamente descartada nem reescrita de forma que pareça funcionar sem
funcionar. **Limitação conhecida, não coberta por teste**: a conversão é por linha, não
por AST — uma expressão Chai encadeada em múltiplas linhas (`pm.expect(x)\n  .to.eql(y)`)
não é reconhecida como uma unidade e cada linha é avaliada isoladamente.

Fixture real: a collection pública "Auth0 Management API"
(github.com/auth0/postman-collections, schema v2.1.0, MIT-like — publicada pela Auth0
para importação livre no Postman), 69 requests em 17 pastas —
`src/main/importers/__fixtures__/auth0-management-api.postman_collection.json`. Não foi
possível gerar a fixture exportando do app desktop do Postman porque este ambiente é
headless e sem conta configurável; usar um export real e público de terceiros é o
substituto mais próximo do "real" pedido no escopo, registrado aqui em vez de
silenciosamente tratado como equivalente. A fixture não exercita auth nem scripts (a
collection original não usa nenhum dos dois) — essas duas áreas têm cobertura própria
em `postman.spec.ts` com snippets Postman válidos construídos à mão, mesmo padrão que
`curl.spec.ts` já usa para casos que não vêm de uma captura real do DevTools.
`postman.integration.spec.ts` cobre o pipeline completo (`detect`→`run`→gravação via
`storage/tree`) contra a fixture, incluindo um teste de snapshot sobre a árvore
normalizada inteira.

---

### EP-08-T03 — Insomnia v4

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-08-T01

**Objetivo.** Importar export do Insomnia.

**Escopo.**

- Export v4 (JSON e YAML): request groups → pastas, requests, bodies, auth.
- Environments, incluindo a herança de base environment.
- Template tags do Insomnia sem equivalente vão para o relatório.

**Critérios de aceite.**

- [x] Hierarquia de request groups preservada
- [x] Environment com herança resolvido corretamente
- [x] Fixture real com teste de snapshot

**Notas de implementação.** `src/main/importers/insomnia.ts`. Diferença estrutural do
Postman: o export do Insomnia não tem uma árvore aninhada — é uma lista plana de
`resources` ligados por `parentId` (o workspace é a raiz; `request_group` e `request`
compartilham o mesmo espaço de `parentId`, então a árvore de pastas é reconstruída
indexando por `parentId` e ordenando irmãos por `metaSortKey`). `detect`/`parse` tentam
`JSON.parse` e caem para `parse` do pacote `yaml` (a mesma lib de `storage/parser.ts`)
sem lançar em nenhum dos dois casos — cobre JSON e YAML com o mesmo código, já que o
Insomnia serializa o mesmo shape nos dois formatos.

Environments formam sua **própria** árvore de herança via `parentId`, separada da
árvore de pastas: só ambientes "folha" (nenhum outro os aponta como pai) viram um
environment do Wttp — o environment base do Insomnia é só um molde, nunca ativado
sozinho na prática — e cada folha resolve a cadeia inteira até a raiz, valor mais
específico vencendo o mais genérico, a mesma regra do próprio Insomnia
(`normalizeEnvironments`). Variável cujo nome sugere segredo (`token`/`secret`/
`password`/`api[_-]?key`, case-insensitive) vira `secret: true` automaticamente, com
aviso no relatório — guiado pela tabela "Mapeamentos que exigem atenção" da skill
`wttp-importer` ("token hardcoded... vira variável marcada `secret: true`"). Isso expôs
uma lacuna real na infra de EP-08-T01: `emitImport`/`runImport` chamavam
`saveEnvironment` sem repassar `encryption`, então qualquer formato que emitisse uma
variável secreta quebraria em teste (fora do Electron, `safeStorage` não existe) — em
produção sempre funcionou, porque o processo main real tem `safeStorage`. Corrigido
threading um `SecretEncryption` opcional (default `osKeychainEncryption`, mesma
convenção de `saveEnvironment` em `storage/environments.ts`) por `runImport` →
`emitImport` → `saveEnvironment`; `postman.ts`/`curl.ts` não precisaram mudar porque
nunca emitem `secret: true`.

Tags `{% ... %}` (Nunjucks) sem equivalente ficam no valor tal como estão — não dá pra
"comentar" um pedaço de URL ou header como se faz com uma linha de script — e a
ocorrência entra no relatório para o usuário resolver manualmente. Scripts
`preRequestScript`/`afterResponseScript` (API `insomnia.*`, adicionada em versões mais
recentes do app) não estão no escopo desta task — a fixture real usada não os tem
(export de 2021, anterior a esse recurso) — mas por precaução contra descarte
silencioso, presença de qualquer um dos dois campos ainda vira uma entrada no relatório
em vez de ser ignorada.

Fixture real: "Insomnia Documenter Demo"
(github.com/insodoc/insomnia-documenter, MIT, exportada pelo Insomnia Desktop
v2021.3.0) — 15 requests em 5 pastas aninhadas até 4 níveis de profundidade, um
environment base com dois sub-environments (Production/Development, cobrindo a herança
do critério de aceite). Mesma situação de EP-08-T02: gerar a fixture a partir do app
desktop de verdade não foi possível neste ambiente headless sem conta configurável; um
export público real de terceiros é o substituto mais próximo, registrado aqui em vez de
tratado como equivalente em silêncio. `insomnia.integration.spec.ts` também verifica que
a mesma fixture, re-serializada em YAML, produz a árvore normalizada idêntica.

---

### EP-08-T04 — OpenAPI 3.x

**Status:** Concluída · **Tamanho:** G · **Depende de:** EP-08-T01

**Objetivo.** Gerar uma collection navegável a partir de uma spec.

**Escopo.**

- Parse de OpenAPI 3.0 e 3.1, JSON e YAML, com resolução de `$ref` interno.
- Agrupamento por tag (ou por primeiro segmento do path, quando não houver tag).
- Body de exemplo gerado a partir do schema, preferindo `example`/`examples` quando presentes.
- `servers` → variável `base_url` num environment por servidor.
- `securitySchemes` → auth na collection.
- Path params e query params extraídos com valores de exemplo.

**Critérios de aceite.**

- [x] Spec real (ex.: Petstore) importa com todos os endpoints
- [x] Body gerado é JSON válido e coerente com o schema
- [x] Cada servidor vira um environment
- [x] `$ref` circular não trava o importador

**Notas de implementação.** `src/main/importers/openapi.ts` — o mais diferente dos
quatro formatos: uma spec OpenAPI não descreve requests prontas, descreve um contrato;
`normalize` gera um endpoint por operação (`method`+`path`), agrupado em pastas por
`tags[0]` ou, na ausência de tag, pelo primeiro segmento do path
(`groupName`/`firstPathSegment`). `{param}` no path vira `:param` — mesma sintaxe que o
resolvedor de path params já usa desde EP-06.1, nenhuma conversão adicional necessária
no lado do Wttp.

`$ref` interno resolvido via ponteiro JSON manual (`resolveJsonPointer`, só
`#/...`, sem suporte a `$ref` remoto/externo — fora do escopo). Duas resoluções
diferentes por necessidade: `deref` segue uma cadeia simples com limite de 50 saltos
(parâmetros, request bodies — ciclo aqui seria um bug da spec, não um caso real
esperado) e `generateExample` rastreia um `Set` dos ponteiros já abertos no ramo de
recursão atual (`visiting`), cortando com `null` ao reencontrar um — é a função que
efetivamente pode ciclar de verdade (`Pet.friends: Pet[]`), coberta por teste com um
schema `Node { children: Node[] }` autorreferente.

Geração de exemplo (`generateExample`) prioriza `schema.example` → primeiro item de
`schema.examples` (3.1) → primeiro valor de `enum` → gera por `type`
(object/array/string com heurística de `format`/integer/number/boolean); `allOf` faz
merge dos sub-schemas gerados, `oneOf`/`anyOf` usa o primeiro. Só `application/json` tem
geração automática — outro content-type sem `application/json` no `requestBody.content`
vira entrada no relatório em vez de corpo inventado (`petstore-3.0.4.json` tem um caso
real: upload de imagem em `application/octet-stream`).

`securitySchemes`: `apiKey` (header/query) e `http` `basic`/`bearer` convertem direto —
o valor gerado referencia `{{<nomeDoScheme>}}` (ex.: `{{api_key}}`) para o usuário saber
exatamente qual variável setar; `apiKey` em cookie, `oauth2`, `openIdConnect` e demais
vão para o relatório. `security` no nível da operação (mesmo `[]` explícito, que vira
`{type: "none"}`) sobrescreve o `security` global do documento; ausência do campo na
operação = herda o auth da collection (`auth: undefined`, mesmo mecanismo de `inherit`
que o resto do app já usa) — só o primeiro requirement/primeiro scheme de cada é
mapeado, o mesmo recorte de "auth simples" que Postman/Insomnia já adotam.

`servers[]` → um `NormalizedEnvironment` por servidor com variável `base_url`; variável
de servidor (`{host}`) é substituída pelo `default` quando presente. Servidor com URL
relativa (`petstore3.swagger.io` usa `/api/v3`, sem host) é mantido como está — o
usuário completa a URL absoluta depois, comportamento verificado contra a fixture real.

Fixtures reais (nenhum spec sintético): `petstore-3.0.4.json`
(petstore3.swagger.io/api/v3/openapi.json — OpenAPI 3.0.4, JSON, 19 operações com
`tags`, dois security schemes reais incluindo um oauth2 não convertível, um servidor de
URL relativa) e `petstore-expanded-3.0.0.yaml`
(github.com/OAI/OpenAPI-Specification, Apache-2.0 — OpenAPI 3.0.0, YAML, 4 operações
**sem** `tags`, cobrindo o fallback de agrupamento pelo primeiro segmento do path, e
schemas com `$ref`). As duas juntas são literalmente o "ex.: Petstore" do critério de
aceite. Swagger 2.0 (`swagger: "2.0"`) é explicitamente rejeitado por `detect` — fora do
escopo desta task, que é só OpenAPI 3.x.

---

### EP-08-T05 — cURL

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-08-T01

**Objetivo.** Colar um comando cURL e ter a request pronta.

**Escopo.**

- Parser de cURL: `-X`, `-H`, `-d`, `--data-raw`, `--data-urlencode`, `-F`, `-u`, `--compressed`, `-k`, aspas e continuação de linha.
- Detecção automática ao colar na barra de URL — colar um cURL preenche a request inteira.
- Também na UI de import.

**Critérios de aceite.**

- [x] Comando copiado do DevTools do Chrome importa corretamente
- [x] Continuação com `\` e aspas aninhadas são tratadas
- [x] Colar uma URL normal continua se comportando como URL, não como cURL

**Notas de implementação.** O parser (`src/main/importers/curl.ts`) tem duas saídas:
`curlImporter` (contrato `Importer` de EP-08-T01, usado por `import:run` para criar
uma request na árvore do workspace) e `parseCurlToRequest`, exposto pelo canal
`import:parseCurl`, usado só pela barra de URL — preenche a aba ativa direto
(`useRequestStore.applyPastedCurl`), sem passar pela árvore. Tokenizador próprio
(`tokenizeShellCommand`) resolve aspas simples/duplas aninhadas e junta continuação de
linha (`\` + quebra) antes de tokenizar. Flag não suportada (ex.: `-b/--cookie`) vira
`ImportReportItem` em vez de travar o parser ou ser descartada em silêncio — mesmo
princípio do resto do épico. Detecção de "isto é um cURL?" é client-side
(`RequestUrlBar.vue`, regex `^\s*curl(\.exe)?\s`) só para decidir se intercepta o
evento `paste` (capture phase, com `stopPropagation` antes do `WCodeEditor`/CodeMirror
processar o paste padrão) — o parsing de verdade continua só no main, a store nunca
duplica a lógica de parsing, só a heurística "vale a pena chamar o IPC?".
A "UI de import" citada no escopo (modal genérico de import) é EP-08-T06 — o que estava
pronto aqui era o formato em si, consumível por ela; agora consumido de fato (`import`
é uma das opções do seletor de formato no modal). **Não verificado**: `-b`/`--cookie` de
um `curl` real do DevTools do Chrome
(Chrome usa `-H 'cookie: ...'`, não `-b`, então não deveria aparecer na prática, mas
não testado contra uma captura real). Mesma pendência de verificação visual (dark/light)
das notas de outros épicos — sem `xvfb`/`sudo` neste ambiente.

---

### EP-08-T06 — UI de importação

**Status:** Concluída (escopo redefinido — ver notas) · **Tamanho:** M · **Depende de:** EP-08-T02, EP-08-T03, EP-08-T04, EP-08-T05

**Objetivo.** Importar com previsibilidade — nada é gravado antes do usuário ver o resultado.

**Escopo.**

- Modal com arquivo, colar conteúdo ou URL; formato detectado automaticamente, com opção de forçar.
- **Preview da árvore antes de gravar**, com escolha da pasta de destino e resolução de conflito de nome.
- Relatório pós-import listando o que não foi convertido, exportável.

**Critérios de aceite.**

- [x] Nada é escrito em disco antes da confirmação
- [ ] Conflito de nome oferece renomear, substituir ou pular — **não aplicável ao escopo redefinido**, ver notas; movido para EP-08-T07
- [x] O relatório é legível e diz o que fazer com cada item não convertido

**Notas de implementação.** O único ponto de entrada existente do botão "Import" era
`WorkspaceLanding.vue` — a tela de **sem workspace aberto**. Isso não bate com "escolher
pasta de destino e resolver conflito de nome" do escopo original, que só faz sentido
importando para dentro de uma árvore já existente. Decisão tomada com o usuário: nesta
task o import sempre cria um workspace **novo** (mesmo `workspace:create` que "Create
workspace" já usa) — sem pasta de destino dentro de uma árvore nem conflito de nome
possível, porque o workspace é sempre vazio no momento da gravação. Import para dentro
de um workspace já aberto (menu de contexto da árvore, "Import into this folder", com
conflito de nome de verdade) virou **EP-08-T07**, task nova.

Pipeline: `import:detect` (já existia) → `import:preview` (**novo**, `parse`+`normalize`
sem `emit` — `src/main/importers/pipeline.ts#previewImport`, reaproveitando o
`parseAndNormalize` que `runImport` também usa) → usuário confirma nome/pasta →
`workspace:create` (cria o workspace vazio) → `import:run` (grava a árvore nele). Nada
toca disco antes do passo de confirmação — verificado em teste
(`pipeline.spec.ts`, `previewImport` não grava nada no `root` temporário).

`ImportPreview`/`ImportPreviewNode` (`src/shared/import.ts`) são um shape **novo**,
deliberadamente mais magro que `NormalizedImport` (tipo interno de `main/importers`) —
só nome/tipo/método por nó, sem `RequestBody`/`AuthConfig` inteiros cruzando o IPC à
toa, já que o preview só exibe, nunca edita.

Dois canais IPC novos, ambos pela skill `wttp-ipc-channel`: `import:preview` (acima) e
`dialog:pickFile` (`src/main/ipc/dialog.ts`, mesmo padrão de `dialog:pickFolder` —
diálogo nativo + filtro de extensão — mas já devolve o conteúdo lido como texto, porque
o único consumo hoje é sempre "ler um arquivo de import inteiro", sem motivo para um
segundo round-trip). `useImportStore` (`src/renderer/src/stores/import.ts`) é o único
ponto que chama `window.wttp.import.*`/`window.wttp.dialog.*` — `ImportModal.vue` só lê
o store, three-step (`source` → `preview` → `report`), reaproveitando `WModal`/
`WCodeEditor`/`WSelect` existentes; `ImportPreviewTree.vue` é um componente recursivo
novo só para a árvore de preview.

**Escopo reduzido conscientemente**: a opção "URL" do modal (citada no escopo) não foi
implementada — buscar uma URL arbitrária a partir do processo main é uma superfície
nova (SSRF a partir de um app desktop, sem precedente de fetch de rede arbitrário no
código hoje) que merece revisão própria antes de existir, não uma decisão tomada de
passagem dentro desta task. Arquivo e colar conteúdo cobrem o caso comum. "Relatório
exportável" (terceiro item do escopo) virou "copiar para a área de transferência" +
"salvar como arquivo" (`dialog:saveFile`, já existente) — nenhum canal novo necessário
para isso.

Mesma pendência de verificação visual (dark/light) das notas de outros épicos — sem
`xvfb`/`sudo` neste ambiente; a UI não foi vista rodando de verdade.

---

### EP-08-T07 — Import para dentro de um workspace já aberto

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-08-T06

**Objetivo.** A metade do escopo original de EP-08-T06 que só faz sentido com um
workspace já aberto: importar sem precisar criar um workspace novo para isso.

**Escopo (redefinido — ver notas).**

- Novo ponto de entrada dentro de um workspace aberto: item "Import" no menu "+" da
  toolbar da árvore (`AppShell.vue`), ao lado de "New collection"/"New folder"/
  "New request".
- Sempre grava na **raiz** do workspace aberto (`targetPath: ""`), como uma collection
  nova — nunca dentro de uma pasta escolhida pelo usuário e nunca por menu de contexto
  de pasta. A raiz de um workspace só pode conter collections e uma collection nunca
  fica dentro de outra (`arch-docs/architecture.md`); import "para dentro de uma pasta"
  violaria essa regra ao tratar o conteúdo importado como filhos soltos de uma pasta
  já existente.
- Reaproveita `import:detect`/`import:preview`/`import:run` (EP-08-T06) sem nenhuma
  mudança de infraestrutura — é o mesmo `targetPath: ""` que `runImport`/`emitImport`
  já sabem tratar desde EP-08-T01, só apontando pro workspace já aberto em vez de um
  recém-criado.

**Critérios de aceite.**

- [x] "Import" aparece no menu "+" da toolbar, ao lado das outras ações de criação
- [x] Import grava sempre na raiz do workspace aberto, como uma collection nova
- [x] Nenhuma collection é criada dentro de outra collection nem dentro de uma pasta

**Fora de escopo.** Reimportar a mesma origem para atualizar uma collection já
importada (diff/sync) — isso é criar tudo de novo, não uma feature de sincronização.
Import por item dentro de uma pasta específica escolhida pelo usuário — o modelo do
app não tem uma noção de "collection" separada de "pasta de nível raiz", então
misturar conteúdo importado com os filhos de uma pasta já existente não tem um
resultado sem ambiguidade; ficou fora, junto com toda a resolução de conflito por
item que só fazia sentido nesse cenário.

**Notas de implementação.** A primeira versão desta task implementou exatamente o que
o escopo original pedia — "Import into this folder" no menu de contexto de uma pasta,
gravando `ImportPreview.children` direto nela (sem pasta-raiz), com conflito de nome
por item (`emitImportMerge`, `resolutions?: ImportConflictResolution[]` em
`import:run`, UI de rename/replace/skip por linha). Rodando o app de verdade (captura
de tela do usuário), ficou claro que isso não é o que faz sentido pro modelo do Wttp:
a raiz de um workspace só tem collections, uma collection nunca fica dentro de outra
(nem de uma pasta), e "importar pra dentro de uma pasta qualquer" tornava esse limite
ambíguo — o item do menu de contexto foi removido, e com ele foi embora toda a
infraestrutura de conflito (`emitImportMerge`, `findChildByName`,
`ImportConflictResolution`/`ImportConflictAction`, o campo `resolutions` de
`RunImportPayload`/`RunImportInput`, os 5 testes que cobriam isso) — sem essa
infraestrutura o import na raiz nunca colide (mesmo motivo por que "New collection"
clicado duas vezes nunca precisa perguntar nada: `createNode` já gera um slug de
arquivo único sozinho).

O que ficou: `useImportStore` continua com dois modos (`newWorkspace`/
`intoWorkspace`) — `startNewWorkspace()` (botão "Import" da `WorkspaceLanding`,
inalterado) e `startIntoWorkspace(root)` (item "Import" do menu "+" em
`AppShell.vue`, via `openImportIntoWorkspace`), mas o segundo é bem mais simples que a
versão anterior: sem passo de conflito, sem `parentPath` — só chama
`import:run({root, targetPath: ""})` e atualiza a árvore. `ImportModal.vue` ramifica
só no texto do passo "destino" (nome+pasta pro modo novo, uma frase fixa
"imports as a new collection at the root" pro modo já-aberto).

Coberto por teste: nenhum novo — o modo `intoWorkspace` reaproveita `runImport`/
`emitImport` sem alterações, já cobertos pelos testes de `pipeline.spec.ts` desde
EP-08-T01/T06. **Não verificado**: UI dos dois modos do modal e o item "Import" da
toolbar rodando de verdade — mesma pendência de verificação visual (dark/light) das
notas de outros épicos, sem `xvfb`/`sudo` neste ambiente.

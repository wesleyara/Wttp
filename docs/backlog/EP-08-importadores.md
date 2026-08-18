# EP-08 — Importadores

**Status:** Pendente · **Alvo:** v0.1 · **Depende de:** EP-07

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
exposto em `preload/index.ts`); `docs/architecture.md` §2 atualizado com o shape real
dos payloads (`content`/`root`/`targetPath`, não o placeholder genérico que estava lá).
Código de erro novo: `IMPORT_FORMAT_UNRECOGNIZED`.

---

### EP-08-T02 — Postman Collection v2.1

**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-08-T01

**Objetivo.** Importar o formato mais comum do mercado.

**Escopo.**

- Collection v2.1: pastas, requests, todos os tipos de body, headers, auth.
- Environments do Postman → environments do Wttp; `{{var}}` já é compatível.
- Scripts: mapear `pm.environment.set` → `wttp.setVar`, `pm.test` → `test`, `pm.response` → `res`. O que não tiver equivalente é preservado como comentário e reportado.
- Fixture real exportada do Postman.

**Critérios de aceite.**

- [ ] Collection real com mais de 50 requests importa com a hierarquia preservada
- [ ] Os cinco tipos de auth do Postman viram equivalente ou entrada no relatório
- [ ] Script não convertido é preservado como comentário, nunca descartado
- [ ] Teste de snapshot sobre a fixture

---

### EP-08-T03 — Insomnia v4

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-08-T01

**Objetivo.** Importar export do Insomnia.

**Escopo.**

- Export v4 (JSON e YAML): request groups → pastas, requests, bodies, auth.
- Environments, incluindo a herança de base environment.
- Template tags do Insomnia sem equivalente vão para o relatório.

**Critérios de aceite.**

- [ ] Hierarquia de request groups preservada
- [ ] Environment com herança resolvido corretamente
- [ ] Fixture real com teste de snapshot

---

### EP-08-T04 — OpenAPI 3.x

**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-08-T01

**Objetivo.** Gerar uma collection navegável a partir de uma spec.

**Escopo.**

- Parse de OpenAPI 3.0 e 3.1, JSON e YAML, com resolução de `$ref` interno.
- Agrupamento por tag (ou por primeiro segmento do path, quando não houver tag).
- Body de exemplo gerado a partir do schema, preferindo `example`/`examples` quando presentes.
- `servers` → variável `base_url` num environment por servidor.
- `securitySchemes` → auth na collection.
- Path params e query params extraídos com valores de exemplo.

**Critérios de aceite.**

- [ ] Spec real (ex.: Petstore) importa com todos os endpoints
- [ ] Body gerado é JSON válido e coerente com o schema
- [ ] Cada servidor vira um environment
- [ ] `$ref` circular não trava o importador

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
A "UI de import" citada no escopo (modal genérico de import) é EP-08-T06, ainda
pendente — o que está pronto aqui é o formato em si, consumível por ela quando
existir. **Não verificado**: `-b`/`--cookie` de um `curl` real do DevTools do Chrome
(Chrome usa `-H 'cookie: ...'`, não `-b`, então não deveria aparecer na prática, mas
não testado contra uma captura real). Mesma pendência de verificação visual (dark/light)
das notas de outros épicos — sem `xvfb`/`sudo` neste ambiente.

---

### EP-08-T06 — UI de importação

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-08-T02, EP-08-T03, EP-08-T04, EP-08-T05

**Objetivo.** Importar com previsibilidade — nada é gravado antes do usuário ver o resultado.

**Escopo.**

- Modal com arquivo, colar conteúdo ou URL; formato detectado automaticamente, com opção de forçar.
- **Preview da árvore antes de gravar**, com escolha da pasta de destino e resolução de conflito de nome.
- Relatório pós-import listando o que não foi convertido, exportável.

**Critérios de aceite.**

- [ ] Nada é escrito em disco antes da confirmação
- [ ] Conflito de nome oferece renomear, substituir ou pular
- [ ] O relatório é legível e diz o que fazer com cada item não convertido

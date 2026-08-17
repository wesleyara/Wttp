# EP-04 — Formato de arquivo e persistência

**Status:** Em andamento · **Alvo:** v0.1 · **Depende de:** EP-03

Implementar [file-format.md](../file-format.md). Este épico é onde a promessa "git-friendly" é cumprida ou perdida — as regras invioláveis do documento são critérios de aceite, não sugestões.

---

### EP-04-T01 — Parser e serializer YAML

**Status:** Concluída · **Tamanho:** G · **Depende de:** EP-03-T01

**Objetivo.** Converter entre arquivo em disco e modelo em memória, sem perdas.

**Escopo.**

- `src/main/storage/serializer.ts` e `parser.ts` para workspace, folder, request e environment.
- **Ordem de chaves fixa definida em código**, não a ordem de inserção do objeto.
- Campos desconhecidos preservados e regravados.
- Blocos literais (`|`) para body, scripts e docs — nunca strings escapadas de uma linha só.

**Critérios de aceite.**

- [x] Teste de round-trip: ler → serializar → **bytes idênticos**, para todos os tipos de arquivo
- [x] Um arquivo com chave desconhecida sobrevive a um ciclo de leitura e escrita
- [x] Alterar um único header muda uma única linha no diff
- [x] Body multilinha permanece legível no YAML

**Notas.** Tipos em `src/shared/storage.ts`, reaproveitando `KeyValueEntry`/`AuthConfig`/`RequestBody`
de `http.ts`. Ordem de chaves e variantes de `body`/`auth` centralizadas em
`src/main/storage/fieldOrder.ts`; a construção do YAML (`yaml` — eemeli/yaml) fica em
`yamlDocument.ts`, com os pares `query`/`headers`/`variables`/`urlencoded`/`multipart`
forçados a mapas flow (`{ name: a, value: b }`) para bater com os exemplos do
file-format.md. Campos desconhecidos ficam em `unknown: Record<string, unknown>` e são
regravados ao final do arquivo. A regra "segredo jamais em YAML" já é aplicada aqui:
`secret: true` força `value: ""` na serialização, independente do que o objeto em
memória carregar — a leitura/escrita do keychain em si é EP-04-T06. Validação de schema
(mensagens de erro, linha, nó inválido) é EP-04-T02, fora de escopo aqui.

---

### EP-04-T02 — Validação de schema

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-04-T01

**Objetivo.** Arquivo inválido produz erro compreensível, não crash.

**Escopo.**

- Validação com mensagem, caminho do arquivo e linha.
- Nó inválido é marcado na árvore; o restante do workspace continua utilizável.
- Mensagens acionáveis: `"method" deve ser um método HTTP válido (recebido: "GETT")`.

**Critérios de aceite.**

- [x] YAML sintaticamente quebrado não impede abrir o workspace
- [x] A mensagem aponta arquivo e linha
- [x] Nenhuma exceção não tratada escapa da camada de storage

**Notas.** `src/main/storage/validate.ts` expõe `validateWorkspace` / `validateFolder` /
`validateRequest` / `validateEnvironment`, cada uma devolvendo `ValidationResult<T>` —
nunca lançando. Usa `parseDocument` do `yaml` (que coleta erros de sintaxe em
`doc.errors` em vez de lançar, ao contrário de `parse()`) mais um `LineCounter` para
localizar a linha de qualquer campo via `range` do nó. Em caso de sucesso, delega a
`parser.ts` para manter a mesma forma (`unknown` etc.) usada pelo round-trip. Only
`wttp` ausente não é tratado como erro aqui — virar versão 1 com aviso é EP-04-T03,
ainda pendente. "Nó inválido marcado na árvore, resto do workspace utilizável" (o
critério de escopo) se completa de fato quando a camada de filesystem (EP-04-T04)
passar a chamar estas funções por arquivo; aqui a garantia é que a validação em si
nunca derruba o processo. `formatSchemaIssue` produz o layout de docs/file-format.md
§7. Testes em `validate.spec.ts`.

---

### EP-04-T03 — Versão de schema e migração

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-04-T02

**Objetivo.** O formato pode evoluir sem quebrar workspaces existentes.

**Escopo.**

- Ler e escrever `wttp: 1`; registro de migradores em `src/main/storage/migrations/`.
- Versão maior que a suportada: erro claro pedindo atualização do app, nunca tentativa de adivinhação.
- Migração pergunta antes de reescrever e sugere commit prévio.

**Critérios de aceite.**

- [ ] Arquivo sem `wttp:` é tratado como versão 1 com aviso
- [ ] Versão futura recusa abrir, com mensagem explícita
- [ ] Um migrador de exemplo (1 → 2) tem teste, ainda que não seja usado

---

### EP-04-T04 — Camada de filesystem do workspace

**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-04-T02

**Objetivo.** Ler e gravar a árvore inteira de um workspace.

**Escopo.**

- Varredura recursiva montando `WorkspaceTree`; ordenação por `seq`.
- Canais `node:read`, `node:write`, `node:move`, `node:delete`; criação de `.gitignore` com `.wttp/` ao inicializar.
- Slug de nome de arquivo com colisão resolvida por sufixo; escrita atômica (arquivo temporário + rename).
- Caminhos de arquivo em bodies resolvidos **relativos à raiz do workspace**; recusar caminho que escape da raiz.

**Critérios de aceite.**

- [ ] Workspace com 500 requests carrega em menos de 1s
- [ ] Interromper o app durante um save nunca deixa arquivo truncado
- [ ] Renomear reordena `seq` das linhas afetadas e só delas
- [ ] `../` num caminho de body é recusado

---

### EP-04-T05 — Watcher de filesystem

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-04-T04

**Objetivo.** Editar arquivos fora do app (git pull, editor) reflete na UI.

**Escopo.**

- Watcher com debounce, ignorando `.wttp/` e arquivos temporários.
- `workspace:changed` com a árvore reconciliada, preservando seleção e abas quando possível.
- Alteração externa num arquivo com edições não salvas gera aviso de conflito, sem sobrescrever.

**Critérios de aceite.**

- [ ] `git checkout` de outra branch atualiza a árvore em segundos
- [ ] Save do próprio app não dispara reload em loop
- [ ] Conflito com aba suja pergunta ao usuário; nada é perdido silenciosamente

---

### EP-04-T06 — Segredos no keychain

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-04-T04

**Objetivo.** Valores sensíveis nunca chegam ao Git.

**Escopo.**

- `secret:get` / `secret:set` usando o keychain do SO, sob `wttp:<workspaceId>:<env>:<name>`.
- Fallback em `.wttp/secrets.json` quando o keychain não está disponível (Linux sem libsecret), com aviso ao usuário.
- Variável `secret: true` grava valor vazio no YAML, sempre.

**Critérios de aceite.**

- [ ] O valor de uma variável secreta não aparece em nenhum arquivo versionado
- [ ] Fallback funciona e avisa que é menos seguro
- [ ] Remover a variável remove também a entrada do keychain

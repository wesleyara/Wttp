# EP-13 — Collection Runner e CLI

**Status:** Concluída (publicação no npm/Marketplace pendente) · **Alvo:** v0.2 · **Depende de:** EP-11

Rodar uma collection inteira de uma vez — na interface para o desenvolvedor, e no terminal para o CI. É o que faz uma collection de testes valer a pena manter: ela roda a cada pull request.

---

### EP-13-T01 — Runner na interface

**Status:** Concluída · **Tamanho:** G

**Objetivo.** Executar uma collection ou pasta e ver o resultado consolidado.

**Escopo.**

- Seleção do que rodar, environment, número de iterações, delay entre requests.
- Execução sequencial respeitando `seq`, com variáveis de runtime fluindo entre requests.
- Progresso em tempo real, com botão de parar.
- Relatório: total, passou, falhou, duração; detalhe por request e por asserção.

**Critérios de aceite.**

- [x] Encadeamento por variável funciona ao longo da execução — `RunVariables` (`src/main/runner/execute.ts`) passa o que `wttp.setVar`/`setCollectionVar` gravam para os elos e requests seguintes; `run.spec.ts` (login grava token → próxima request manda `Bearer`) e o workspace de exemplo inteiro pela UI (5/5, 9/9 asserções, "token matches what Login stored")
- [x] Parar interrompe de fato, incluindo a requisição em andamento — `AbortSignal` → `cancelHttpRequest` da request em voo; `run.spec.ts` (request de 5 s parada em ~200 ms, nada roda depois)
- [x] Collection de 100 requests roda sem degradar a UI — o run é no main (`runner:start` devolve na hora, progresso por `runner:event`); `run.spec.ts` roda 100 requests bem abaixo de 5 s
- [x] Falha numa request não interrompe as seguintes (comportamento configurável) — padrão continua; "Stop on first failure" (`bail`) para; `run.spec.ts` e `e2e/collection-runner.spec.ts`

**Como ficou.** Núcleo de execução em `src/main/runner/` (`plan.ts` → ordem da árvore ou a
seleção da tela; `execute.ts` → herança de auth, `{{var}}`/path params, cadeia de
pre-request, envio, cadeia de tests, igual ao `dispatch()` do envio avulso; `run.ts` →
iterações, intervalo, `bail`, Stop, gravação opcional das variáveis no fim), sem Electron:
envio, scripts e segredos chegam por `RunnerDeps`. É a base do CLI (T02) e dos Flows
(ClickLocal #57). Canais `runner:start`/`runner:stop` e evento `runner:event`
(`src/main/ipc/runner.ts`); aba `runner` singleton (`RunnerPanel.vue`, `useRunnerStore`)
aberta pelo menu de contexto de pasta/collection ("Run…") ou pela busca rápida (workspace
inteiro). Decisão do usuário (2026-09-24): ordem da pasta, com desmarcar/reordenar só para
a execução — o cenário salvo e reaproveitável fica para os Flows. O runner lê do disco: a
aba avisa quando uma request selecionada tem alterações não salvas.

---

### EP-13-T02 — CLI `wttp run`

**Status:** Concluída (publicação no npm pendente) · **Tamanho:** G · **Depende de:** EP-13-T01

**Objetivo.** Rodar collections no CI, sem interface gráfica.

**Escopo.**

- Binário Node independente do Electron, reutilizando `main/http`, `main/storage` e o runner de scripts — a lógica é compartilhada, não duplicada.
- `wttp run <caminho> --env dev --reporter junit --bail`.
- Reporters: `cli`, `json`, `junit`.
- Exit code diferente de zero quando há falha.
- Segredos vindos de variáveis de ambiente, já que não há keychain no CI.

**Critérios de aceite.**

- [x] Funciona num container sem display — Node puro (`cli/dist/wttp.mjs`, nada de `electron` no grafo); `scripts/cli-smoke.mjs` roda o binário sem `DISPLAY`/`WAYLAND_DISPLAY`, e o job `quality` (ubuntu) do CI roda o smoke
- [ ] Saída JUnit é lida corretamente por GitHub Actions e GitLab CI — **não verificado num CI real**; o XML segue o formato do newman (uma `<testsuite>` por request, `<testcase>` por asserção, `<failure>`/`<error>`), escapado e sem caracteres de controle (`cli.spec.ts`), bem formado e com as contagens certas (smoke)
- [x] Exit code correto em sucesso e em falha — 0/1/2 (`cli.spec.ts`, smoke)
- [ ] Publicado no npm, executável via `npx` — pacote pronto em `cli/` (`wttp-cli`, `bin: wttp`, bundle sem dependências); **publicar é ação do dono do repositório** (`yarn build:cli && cd cli && npm publish`)

**Como ficou.** `src/cli/` (`cli.ts` = `runCli` testável em processo, `reporters.ts`,
`index.ts` = binário), empacotado por `vite.cli.config.ts` (`yarn build:cli`) com o worker de
scripts ao lado. O host do processo de scripts virou genérico (`src/main/scripts/host.ts`):
`utilityProcess` no app, `child_process.fork` com `serialization: "advanced"` no CLI — o
padrão JSON do Node transformava o body `Uint8Array` num objeto (achado pelo smoke).
Segredos por `WTTP_SECRET_<NOME>`, mascarados como `****` em tudo que o CLI imprime ou grava;
`--var` para sobrescrever variáveis (camada `runtime` do resolvedor).

---

### EP-13-T03 — Integração com CI

**Status:** Concluída (publicação e teste em repositório real pendentes) · **Tamanho:** P · **Depende de:** EP-13-T02

**Objetivo.** Adotar o Wttp no pipeline é copiar dez linhas.

**Escopo.**

- GitHub Action publicada e exemplos para GitLab CI e Jenkins em `docs/ci.md`.
- Documentar a passagem de segredos por variável de ambiente.

**Critérios de aceite.**

- [ ] Exemplo funcional testado num repositório real — `action.yml` (composite, entradas passadas por variável de ambiente, nunca interpoladas no script) exercitado localmente com um `npx` falso apontando para o CLI construído: exit 0 com JUnit e output `junit`, exit 1 com `bail`, tentativa de injeção pelo `path` não executa; **rodar num repositório real depende de publicar o `wttp-cli` e criar a tag `v1`**
- [x] Documentação deixa claro como não vazar segredo em log — `docs/guia/runner-e-ci.md` / `docs/en/guide/runner-and-ci.md` (cofre do CI → `WTTP_SECRET_*`, nunca `--var`, mascaramento automático), com exemplos para GitHub Actions, GitLab CI e Jenkins. A doc de usuário mora em `docs/guia/**` desde EP-08.1, não em `docs/ci.md`.

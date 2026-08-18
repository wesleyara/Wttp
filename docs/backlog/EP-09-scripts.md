# EP-09 — Scripts e testes

**Status:** Concluída (verificação visual pendente) · **Alvo:** v0.1 · **Depende de:** EP-08

Scripts pre-request e de teste. É o que permite encadear requisições — fazer login, guardar o token, usar nas próximas — e transformar uma collection num conjunto de testes.

Referência: [architecture.md §5](../architecture.md)

> **Este é o épico de maior risco de segurança do MVP.** Scripts vêm de collections que o usuário importa de terceiros. O isolamento não é opcional.

> **Nota de ordem:** EP-08 (Importadores), declarado como dependência, ainda estava
> `Pendente` (só cURL e o parser genérico prontos) quando este épico foi implementado —
> decisão explícita do usuário de seguir mesmo assim, já que scripts não têm
> acoplamento funcional com importadores. Nada aqui depende do que falta em EP-08.

---

### EP-09-T01 — Script runner isolado

**Status:** Concluída · **Tamanho:** G · **Depende de:** EP-01-T04

**Objetivo.** Código de usuário roda sem alcançar o app nem travar a UI.

**Escopo.**

- `utilityProcess` do Electron rodando `node:vm` com contexto montado explicitamente.
- **Sem** `ipcRenderer`, `fs`, `net`, `require`, `process` ou `child_process` no contexto.
- Timeout padrão de 5s (configurável no workspace); ao estourar, o processo é morto e a requisição falha com `SCRIPT_TIMEOUT`.
- Comunicação por `postMessage` estruturado, apenas dados serializáveis.
- Processo reciclado entre execuções; crash do runner não derruba o app.

**Critérios de aceite.**

- [x] `while(true){}` é morto pelo timeout e a UI permanece responsiva — a UI vive no processo renderer, o script trava só o utility process isolado (`src/main/scripts/worker.ts`), morto pelo timeout do próprio `node:vm` e por um backstop no `runner.ts`
- [x] Tentar `require("fs")` ou alcançar `process` falha com erro claro — `ReferenceError: require/process is not defined`, `src/main/scripts/sandbox.spec.ts`
- [x] Crash do runner é recuperado sem restart do app — `runner.ts` respawna o worker na próxima chamada, `src/main/scripts/runner.spec.ts`
- [x] Testes cobrindo timeout, crash e tentativa de escape — `sandbox.spec.ts`, `runner.spec.ts`

---

### EP-09-T02 — API de scripting

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-09-T01

**Objetivo.** Uma superfície pequena, previsível e documentada.

**Escopo.**

- `wttp.setVar(name, value)` / `wttp.getVar(name)` — variáveis de runtime, precedência máxima.
- `req` mutável na fase pre-request; `res` **congelada** na fase de tests.
- `test(name, fn)` e `expect(value)` com os matchers `toBe`, `toEqual`, `toBeTruthy`, `toContain`, `toHaveProperty`, `toMatch`.
- `console.log/warn/error` capturados e devolvidos ao renderer.
- Documentar a API em `docs/scripting.md`.

**Critérios de aceite.**

- [x] Alterar `res` num script de teste não afeta o que a UI mostra — `res` passa por `freezeDeep` antes de entrar no vm, `api.spec.ts`
- [x] Alterar `req` no pre-request afeta a requisição enviada — `executeScript` devolve o `req` mutado como `ScriptRunResult.req`, `api.spec.ts`
- [x] Falha de asserção é reportada com valor esperado e recebido — mensagem do matcher inclui os dois lados (`toBe`/`toEqual`/etc.), `api.spec.ts`
- [x] Exceção não tratada no script vira falha da request, não crash — `ScriptRunResult.ok: false` com `error`, nunca lança, `api.spec.ts`

**Nota (redesenho pós-lançamento):** o escopo original tinha `wttp.setVar`/`getVar`
como variáveis de **runtime** (só em memória, precedência máxima no resolvedor). A
pedido do usuário depois do épico fechado, viraram: `setVar`/`getVar` grava/lê no
**environment ativo** (persistido em `environments/<env>.yaml` imediatamente); um par
novo, `setCollectionVar`/`getCollectionVar`, grava/lê na **collection** (pasta raiz)
da request, em `folder.yaml`. Sem environment ativo ou sem collection, a chamada falha
com mensagem clara em vez de não ter onde escrever. Uma variável `secret: true` nunca é
sobrescrita por um script. Ver `docs/scripting.md` para a API atual — `main/scripts/
api.ts` e `renderer/stores/requestTabs.ts` (`persistEnvVars`/`persistCollectionVars`)
têm os detalhes; `useScriptRuntimeStore` (o conceito de runtime) foi removido.

---

### EP-09-T03 — Integração no fluxo da request

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-09-T02, EP-06-T01

**Objetivo.** Scripts rodam na ordem correta do ciclo de vida.

**Escopo.**

- Ordem de [architecture.md §4](../architecture.md): resolver variáveis → pre-request → envio → tests.
- Variáveis de runtime definidas no script ficam disponíveis para as requests seguintes na sessão.
- Herança de scripts de pasta e collection (pré e pós), executados em volta dos da request.
- Falha no pre-request aborta o envio; falha nos tests não invalida a resposta.

**Critérios de aceite.**

- [x] Encadeamento funciona: login guarda token, request seguinte autentica sozinha — `wttp.setVar` grava no environment ativo (`persistEnvVars`, `env:save`), que já é a fonte natural de `{{token}}` na próxima resolução, `requestTabs.spec.ts`
- [x] Ordem verificada por teste, incluindo herança de pasta — pre-request de fora pra dentro (collection → pasta → request), tests de dentro pra fora, `scriptChain.spec.ts` + `requestTabs.spec.ts`
- [x] Erro no pre-request impede o envio, com mensagem clara — `runPreRequestChain` aborta no primeiro elo que falhar, toast com a origem e a mensagem, `requestTabs.spec.ts`

**Nota (superada):** a versão original desta nota dizia que scripts de pasta/collection não tinham editor próprio — corrigido depois, ver EP-09-T04: `FolderConfigTabs.vue` agora edita `scripts.preRequest`/`scripts.tests` da pasta/collection, mesmo padrão da request.

---

### EP-09-T04 — Editor de scripts

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-09-T02, EP-03-T04

**Objetivo.** Escrever scripts confortavelmente.

**Escopo.**

- Aba Scripts com dois editores CodeMirror (pre-request e tests), JavaScript com highlight.
- Autocomplete da API `wttp.*`, `req`, `res`, `test`, `expect`.
- Snippets para os padrões comuns (guardar token, checar status).
- Indicador na aba quando há script definido.

**Critérios de aceite.**

- [x] Autocomplete cobre toda a API documentada — `wttp.*`/`req.*`/`res.*`/`console.*`/matchers de `expect`, restrito ao que existe em cada fase, `scriptCompletions.spec.ts` (verificado com `CompletionContext` real do CodeMirror, não só um mock)
- [x] Erro de sintaxe é sinalizado antes do envio — `@codemirror/lint` com os nós de erro da árvore do lezer, gutter vermelho na aba Scripts
- [x] Scripts persistem no YAML como bloco literal legível — reaproveita o serializer de `scripts` já testado em EP-04 (`SCRIPTS_FIELD_ORDER`, round-trip byte a byte)
- [x] Editor de scripts também existe a nível de pasta/collection — `FolderConfigTabs.vue`, mesmo `WCodeEditor`/autocomplete/lint da request, gravando em `folder.yaml` via `saveFolderTab`

**Nota:** `@codemirror/lint` (usado pelo linter de sintaxe) já vem transitivo via `codemirror`/`@codemirror/lang-javascript`, mas eu não consegui promovê-lo a dependência direta no `package.json` — `yarn install` neste ambiente falha em `@babel/generator@8.0.0` (exige Node ≥22.18, o ambiente tem 22.13.1), um problema de ambiente sem relação com EP-09. Fica como pendência de infra, não deste épico.

**Nota:** verificação visual (dois temas, abrir a aba Scripts numa janela de verdade) não foi feita — mesma pendência de `xvfb`/`sudo` já registrada em EP-02/03/05/06/07.

---

### EP-09-T05 — Resultados de teste e console

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-09-T03, EP-03-T07

**Objetivo.** Ver o que os scripts fizeram.

**Escopo.**

- Aba Tests no painel de resposta: lista de asserções com passou/falhou, duração e detalhe da falha.
- Contador de falhas na aba; resumo na barra de status.
- Console de scripts com os `console.*` capturados, associados à request e à fase.

**Critérios de aceite.**

- [x] Falha mostra esperado versus recebido de forma legível — mensagem do matcher tem os dois lados (`ScriptResultsPanel.vue`, reaproveita `api.ts`)
- [x] Console distingue a fase (pre-request ou tests) — cada linha mostra `entry.phase` e a origem na cadeia
- [x] Request sem scripts não exibe abas vazias — aba Tests só entra em `mainTabs` quando `hasScriptResults`

**Nota:** verificação visual (dois temas, abrir a aba Tests numa janela de verdade) não foi feita — mesma pendência de `xvfb`/`sudo` já registrada nas notas acima e em EP-02/03/05/06/07.

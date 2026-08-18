# EP-09 — Scripts e testes

**Status:** Pendente · **Alvo:** v0.1 · **Depende de:** EP-08

Scripts pre-request e de teste. É o que permite encadear requisições — fazer login, guardar o token, usar nas próximas — e transformar uma collection num conjunto de testes.

Referência: [architecture.md §5](../architecture.md)

> **Este é o épico de maior risco de segurança do MVP.** Scripts vêm de collections que o usuário importa de terceiros. O isolamento não é opcional.

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

---

### EP-09-T03 — Integração no fluxo da request

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-09-T02, EP-06-T01

**Objetivo.** Scripts rodam na ordem correta do ciclo de vida.

**Escopo.**

- Ordem de [architecture.md §4](../architecture.md): resolver variáveis → pre-request → envio → tests.
- Variáveis de runtime definidas no script ficam disponíveis para as requests seguintes na sessão.
- Herança de scripts de pasta e collection (pré e pós), executados em volta dos da request.
- Falha no pre-request aborta o envio; falha nos tests não invalida a resposta.

**Critérios de aceite.**

- [ ] Encadeamento funciona: login guarda token, request seguinte autentica sozinha
- [ ] Ordem verificada por teste, incluindo herança de pasta
- [ ] Erro no pre-request impede o envio, com mensagem clara

---

### EP-09-T04 — Editor de scripts

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-09-T02, EP-03-T04

**Objetivo.** Escrever scripts confortavelmente.

**Escopo.**

- Aba Scripts com dois editores CodeMirror (pre-request e tests), JavaScript com highlight.
- Autocomplete da API `wttp.*`, `req`, `res`, `test`, `expect`.
- Snippets para os padrões comuns (guardar token, checar status).
- Indicador na aba quando há script definido.

**Critérios de aceite.**

- [ ] Autocomplete cobre toda a API documentada
- [ ] Erro de sintaxe é sinalizado antes do envio
- [ ] Scripts persistem no YAML como bloco literal legível

---

### EP-09-T05 — Resultados de teste e console

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-09-T03, EP-03-T07

**Objetivo.** Ver o que os scripts fizeram.

**Escopo.**

- Aba Tests no painel de resposta: lista de asserções com passou/falhou, duração e detalhe da falha.
- Contador de falhas na aba; resumo na barra de status.
- Console de scripts com os `console.*` capturados, associados à request e à fase.

**Critérios de aceite.**

- [ ] Falha mostra esperado versus recebido de forma legível
- [ ] Console distingue a fase (pre-request ou tests)
- [ ] Request sem scripts não exibe abas vazias

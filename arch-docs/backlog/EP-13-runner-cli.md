# EP-13 — Collection Runner e CLI

**Status:** Pendente · **Alvo:** v0.2 · **Depende de:** EP-11

Rodar uma collection inteira de uma vez — na interface para o desenvolvedor, e no terminal para o CI. É o que faz uma collection de testes valer a pena manter: ela roda a cada pull request.

---

### EP-13-T01 — Runner na interface

**Status:** Pendente · **Tamanho:** G

**Objetivo.** Executar uma collection ou pasta e ver o resultado consolidado.

**Escopo.**

- Seleção do que rodar, environment, número de iterações, delay entre requests.
- Execução sequencial respeitando `seq`, com variáveis de runtime fluindo entre requests.
- Progresso em tempo real, com botão de parar.
- Relatório: total, passou, falhou, duração; detalhe por request e por asserção.

**Critérios de aceite.**

- [ ] Encadeamento por variável funciona ao longo da execução
- [ ] Parar interrompe de fato, incluindo a requisição em andamento
- [ ] Collection de 100 requests roda sem degradar a UI
- [ ] Falha numa request não interrompe as seguintes (comportamento configurável)

---

### EP-13-T02 — CLI `wttp run`

**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-13-T01

**Objetivo.** Rodar collections no CI, sem interface gráfica.

**Escopo.**

- Binário Node independente do Electron, reutilizando `main/http`, `main/storage` e o runner de scripts — a lógica é compartilhada, não duplicada.
- `wttp run <caminho> --env dev --reporter junit --bail`.
- Reporters: `cli`, `json`, `junit`.
- Exit code diferente de zero quando há falha.
- Segredos vindos de variáveis de ambiente, já que não há keychain no CI.

**Critérios de aceite.**

- [ ] Funciona num container sem display
- [ ] Saída JUnit é lida corretamente por GitHub Actions e GitLab CI
- [ ] Exit code correto em sucesso e em falha
- [ ] Publicado no npm, executável via `npx`

---

### EP-13-T03 — Integração com CI

**Status:** Pendente · **Tamanho:** P · **Depende de:** EP-13-T02

**Objetivo.** Adotar o Wttp no pipeline é copiar dez linhas.

**Escopo.**

- GitHub Action publicada e exemplos para GitLab CI e Jenkins em `docs/ci.md`.
- Documentar a passagem de segredos por variável de ambiente.

**Critérios de aceite.**

- [ ] Exemplo funcional testado num repositório real
- [ ] Documentação deixa claro como não vazar segredo em log

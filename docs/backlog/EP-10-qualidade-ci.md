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

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-10-T01

**Objetivo.** Os fluxos que o usuário realmente percorre não quebram.

**Escopo.**

- Playwright com driver de Electron.
- Fluxos: criar workspace → criar request → enviar → salvar → fechar → reabrir e conferir; trocar environment e reenviar; importar collection do Postman; rodar request com script de teste.
- Poucos e estáveis — E2E não substitui teste unitário.

**Critérios de aceite.**

- [ ] Os quatro fluxos passam nos três SOs
- [ ] Sem flakiness em 10 execuções seguidas
- [ ] Falha produz screenshot e trace

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

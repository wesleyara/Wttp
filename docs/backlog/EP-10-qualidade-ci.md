# EP-10 — Qualidade e CI

**Status:** Pendente · **Alvo:** v0.1 · **Depende de:** EP-09

Rede de segurança antes de distribuir. Um cliente HTTP que corrompe os arquivos do usuário perde a confiança de uma vez só — e os arquivos são o produto.

---

### EP-10-T01 — Suíte de testes do núcleo

**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-09-T03

**Objetivo.** As três camadas críticas têm cobertura real.

**Escopo.**

- **`main/http`**: todos os tipos de body, redirects, timeout, cancelamento, erro de rede, timing.
- **`main/storage`**: round-trip byte a byte de todos os tipos de arquivo, validação, migração, escrita atômica.
- **`main/importers`**: fixture real por formato com teste de snapshot.
- Servidor HTTP local de teste para o engine — sem dependência de rede externa.
- Limiar de cobertura configurado e obrigatório nessas três pastas.

**Critérios de aceite.**

- [ ] Suíte roda sem Electron e sem internet
- [ ] Cobertura acima do limiar nas três pastas, verificada no CI
- [ ] Suíte completa abaixo de 30s

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

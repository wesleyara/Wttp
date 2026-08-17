# EP-12 — Documentação de APIs

**Status:** Pendente · **Alvo:** v0.2 · **Depende de:** EP-11

Fecha a promessa do [overview](../overview.md): documentar a API junto do lugar onde ela é testada. A documentação fica no mesmo YAML da request, versionada com o código — o oposto de um wiki que envelhece.

---

### EP-12-T01 — Editor de documentação
**Status:** Pendente · **Tamanho:** M

**Objetivo.** Escrever markdown por request, pasta e collection.

**Escopo.**
- Campo `docs` já previsto no formato de arquivo; editor com preview lado a lado.
- Suporte a markdown padrão, blocos de código e tabelas.
- Referência a `{{variáveis}}` renderizada com o valor do environment ativo.

**Critérios de aceite.**
- [ ] Markdown persiste como bloco literal legível no YAML
- [ ] Preview acompanha o tema do app

---

### EP-12-T02 — Painel de leitura
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-12-T01

**Objetivo.** Ler a documentação sem sair da ferramenta.

**Escopo.**
- Modo leitura da collection: navegação por índice, documentação da pasta seguida das requests.
- Exemplos de requisição e resposta gerados a partir da última execução, quando houver.

**Critérios de aceite.**
- [ ] Navegar pela documentação não perde o estado das abas de trabalho
- [ ] Request sem `docs` aparece com a assinatura mínima (método, URL, params)

---

### EP-12-T03 — Export estático
**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-12-T02

**Objetivo.** Publicar a documentação para quem não usa o Wttp.

**Escopo.**
- Export para HTML estático de arquivo único (autocontido, sem CDN) e para markdown.
- Índice navegável, busca, dark/light.
- Geração de snippets de exemplo (cURL, fetch, axios) por request.
- Segredos e valores de environment sensíveis **nunca** são exportados.

**Critérios de aceite.**
- [ ] HTML exportado abre offline e é navegável
- [ ] Nenhum valor secreto aparece no export, verificado por teste
- [ ] Export de collection com 100 requests é gerado em segundos

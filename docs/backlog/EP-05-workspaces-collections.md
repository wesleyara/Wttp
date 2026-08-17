# EP-05 — Workspaces, collections e tabs

**Status:** Pendente · **Alvo:** v0.1 · **Depende de:** EP-04

Organizar o trabalho: abrir um workspace, navegar pela árvore, trabalhar com várias requests abertas.

---

### EP-05-T01 — Abrir e criar workspace
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-04-T04

**Objetivo.** O usuário escolhe uma pasta e começa a trabalhar.

**Escopo.**
- `workspace:open` com diálogo nativo de pasta; `workspace:create` gerando `wttp.yaml`, `environments/` e `.gitignore`.
- Lista de recentes persistida nas configurações do app, com remoção de entradas cujo caminho sumiu.
- Tela inicial: abrir, criar, recentes e importar.

**Critérios de aceite.**
- [ ] Abrir uma pasta que não é workspace oferece inicializá-la
- [ ] Recente apontando para pasta removida é sinalizado, não some silenciosamente
- [ ] Último workspace reabre automaticamente ao iniciar o app

---

### EP-05-T02 — `WTree` — árvore de collections
**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-05-T01, EP-02-T03

**Objetivo.** Navegar por toda a hierarquia com fluidez.

**Escopo.**
- Árvore virtualizada com pastas expansíveis, `WMethodBadge` por request, estado de expansão persistido.
- Navegação por teclado completa (setas, `Enter`, `Home`/`End`, digitar para saltar).
- Filtro por texto que preserva o caminho até os resultados.
- Nó inválido (EP-04-T02) exibido com ícone de erro e tooltip.

**Critérios de aceite.**
- [ ] 1000 nós rolam a 60fps
- [ ] Toda ação alcançável por teclado
- [ ] Filtrar mostra a hierarquia até cada resultado, não uma lista plana

---

### EP-05-T03 — CRUD na árvore
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-05-T02

**Objetivo.** Gerenciar collections, pastas e requests pela interface.

**Escopo.**
- Menu de contexto e atalhos: nova request, nova pasta, renomear, duplicar, excluir, revelar no explorador de arquivos.
- Rename inline; duplicar resolve colisão de nome.
- Excluir pede confirmação e move para a lixeira do SO quando possível, em vez de apagar.

**Critérios de aceite.**
- [ ] Cada operação grava em disco imediatamente e a árvore reflete o resultado
- [ ] Nome com `/`, `\` ou reservado do Windows é tratado no slug sem quebrar
- [ ] Excluir uma pasta com filhos avisa quantos itens serão afetados

---

### EP-05-T04 — Drag & drop e ordenação
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-05-T03

**Objetivo.** Reorganizar a estrutura arrastando.

**Escopo.**
- Arrastar requests e pastas entre pastas e dentro da mesma pasta; indicador de destino.
- Mover reescreve os `seq` afetados e move o arquivo em disco (`node:move`).
- Recusar mover uma pasta para dentro dela mesma.

**Critérios de aceite.**
- [ ] Reordenar altera o `seq` só das linhas necessárias — diff mínimo
- [ ] Mover entre pastas move o arquivo, sem duplicar
- [ ] Drop inválido é recusado com feedback visual, sem alterar nada

---

### EP-05-T05 — Abas de request
**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-05-T02, EP-03-T06

**Objetivo.** Trabalhar com várias requests ao mesmo tempo.

**Escopo.**
- `useRequestTabsStore`: abrir, fechar, reordenar, aba de preview (clique simples em itálico, duplo clique fixa).
- Indicador de estado sujo; fechar aba suja pergunta antes.
- `Ctrl+S` salva, `Ctrl+W` fecha, `Ctrl+Tab` navega.
- Sessão restaurada de `.wttp/ui-state.json` ao reabrir o workspace.

**Critérios de aceite.**
- [ ] Alterações não salvas nunca são perdidas sem confirmação explícita
- [ ] Sessão restaura abas, aba ativa e ordem
- [ ] Excluir uma request com aba aberta fecha a aba de forma limpa
- [ ] Cada aba mantém sua própria resposta

---

### EP-05-T06 — Busca rápida
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-05-T05

**Objetivo.** Chegar a qualquer request sem usar o mouse.

**Escopo.**
- `Ctrl+P` abre paleta com busca fuzzy por nome, caminho e URL.
- Resultado mostra método e caminho; `Enter` abre em preview, `Ctrl+Enter` fixa.

**Critérios de aceite.**
- [ ] Resposta abaixo de 50ms com 1000 requests
- [ ] `Esc` fecha e devolve o foco ao contexto anterior
- [ ] Ranking prioriza correspondência no início do nome

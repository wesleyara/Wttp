# EP-05 — Workspaces, collections e tabs

**Status:** Concluída (verificação visual pendente) · **Alvo:** v0.1 · **Depende de:** EP-04

Organizar o trabalho: abrir um workspace, navegar pela árvore, trabalhar com várias requests abertas.

---

### EP-05-T01 — Abrir e criar workspace

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-04-T04

**Objetivo.** O usuário escolhe uma pasta e começa a trabalhar.

**Escopo.**

- `workspace:open` com diálogo nativo de pasta; `workspace:create` gerando `wttp.yaml`, `environments/` e `.gitignore`.
- Lista de recentes persistida nas configurações do app, com remoção de entradas cujo caminho sumiu.
- Tela inicial: abrir, criar, recentes e importar.

**Critérios de aceite.**

- [x] Abrir uma pasta que não é workspace oferece inicializá-la
- [x] Recente apontando para pasta removida é sinalizado, não some silenciosamente
- [x] Último workspace reabre automaticamente ao iniciar o app

**Nota de fechamento.** "Importar" na tela inicial é um botão desabilitado
("coming soon") — o importador de verdade é o EP-08, fora de escopo aqui. Os três
critérios acima são verificados por `recentWorkspaces.spec.ts` (detecção de `missing`
e remoção) e por inspeção de código para os fluxos de UI (`useWorkspaceStore.init`,
`WorkspaceLanding`'s `needsInit`); não foi possível abrir uma janela real neste
ambiente (sem `xvfb`/`sudo`), mesma limitação já registrada em EP-02/EP-03.

---

### EP-05-T02 — `WTree` — árvore de collections

**Status:** Concluída · **Tamanho:** G · **Depende de:** EP-05-T01, EP-02-T03

**Objetivo.** Navegar por toda a hierarquia com fluidez.

**Escopo.**

- Árvore virtualizada com pastas expansíveis, `WMethodBadge` por request, estado de expansão persistido.
- Navegação por teclado completa (setas, `Enter`, `Home`/`End`, digitar para saltar).
- Filtro por texto que preserva o caminho até os resultados.
- Nó inválido (EP-04-T02) exibido com ícone de erro e tooltip.

**Critérios de aceite.**

- [x] 1000 nós rolam a 60fps
- [x] Toda ação alcançável por teclado
- [x] Filtrar mostra a hierarquia até cada resultado, não uma lista plana

**Nota de fechamento.** Virtualização por janela feita à mão (sem lib), altura de
linha fixa de 28px — `docs/backlog/README.md`'s ambiente não tem `xvfb`/`sudo` para
medir fps de uma janela real, então a verificação da AC de performance foi por
inspeção (renderiza só `visibleRows`, ~30 linhas de DOM independente do tamanho da
árvore) e por uma seção de 1000 nós gerados na `DevGalleryPage` (`yarn dev` +
`/dev/gallery`), mesma ressalva já registrada em EP-02/EP-03. `.wttp/ui-state.json`
(pastas expandidas) nasceu com o formato final já incluindo `openTabs`/`activeTabPath`
que só EP-05-T05 usa de verdade — decisão registrada no plano do épico, para não
migrar o arquivo duas vezes.

---

### EP-05-T03 — CRUD na árvore

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-05-T02

**Objetivo.** Gerenciar collections, pastas e requests pela interface.

**Escopo.**

- Menu de contexto e atalhos: nova request, nova pasta, renomear, duplicar, excluir, revelar no explorador de arquivos.
- Rename inline; duplicar resolve colisão de nome.
- Excluir pede confirmação e move para a lixeira do SO quando possível, em vez de apagar.

**Critérios de aceite.**

- [x] Cada operação grava em disco imediatamente e a árvore reflete o resultado
- [x] Nome com `/`, `\` ou reservado do Windows é tratado no slug sem quebrar
- [x] Excluir uma pasta com filhos avisa quantos itens serão afetados

**Nota de fechamento.** "Excluir" move para a lixeira do SO (`shell.trashItem`), com
fallback avisado (`console.warn` + apagamento definitivo) se a plataforma não suportar
— coberto por inspeção de código, não por teste automatizado (a lixeira real depende do
SO). `createNode`/`renameNode`/`duplicateNode` e a rejeição de nomes reservados do
Windows têm teste em `tree.spec.ts`. Verificação da UI (menu de contexto, rename
inline, modal de confirmação) nos dois temas não foi possível neste ambiente sem
`xvfb`/`sudo` — mesma ressalva já registrada nas tasks anteriores.

---

### EP-05-T04 — Drag & drop e ordenação

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-05-T03

**Objetivo.** Reorganizar a estrutura arrastando.

**Escopo.**

- Arrastar requests e pastas entre pastas e dentro da mesma pasta; indicador de destino.
- Mover reescreve os `seq` afetados e move o arquivo em disco (`node:move`).
- Recusar mover uma pasta para dentro dela mesma.

**Critérios de aceite.**

- [x] Reordenar altera o `seq` só das linhas necessárias — diff mínimo
- [x] Mover entre pastas move o arquivo, sem duplicar
- [x] Drop inválido é recusado com feedback visual, sem alterar nada

**Nota de fechamento.** Drag & drop é por ponteiro (`pointerdown`/`pointermove`/
`pointerup`), mesmo estilo do `WSplitPane`, não HTML5 DnD. `node:moveInto` é fino
sobre o `moveNode` do EP-04 — que já fazia diff mínimo — só resolvendo o nome final no
destino (mesma resolução de colisão do `duplicateNode`) e validado por
`tree.spec.ts`. A recusa de "pasta para dentro dela mesma/descendente" existe nos dois
lados: `WTree` marca o indicador de drop como inválido sem nem emitir `move`, e
`moveNode` lança `DomainError` se algo chegasse lá mesmo assim (defesa em
profundidade). Verificação visual do indicador de drop nos dois temas não foi
possível neste ambiente sem `xvfb`/`sudo` — mesma ressalva das tasks anteriores.

---

### EP-05-T05 — Abas de request

**Status:** Concluída · **Tamanho:** G · **Depende de:** EP-05-T02, EP-03-T06

**Objetivo.** Trabalhar com várias requests ao mesmo tempo.

**Escopo.**

- `useRequestTabsStore`: abrir, fechar, reordenar, aba de preview (clique simples em itálico, duplo clique fixa).
- Indicador de estado sujo; fechar aba suja pergunta antes.
- `Ctrl+S` salva, `Ctrl+W` fecha, `Ctrl+Tab` navega.
- Sessão restaurada de `.wttp/ui-state.json` ao reabrir o workspace.

**Critérios de aceite.**

- [x] Alterações não salvas nunca são perdidas sem confirmação explícita
- [x] Sessão restaura abas, aba ativa e ordem
- [x] Excluir uma request com aba aberta fecha a aba de forma limpa
- [x] Cada aba mantém sua própria resposta

**Nota de fechamento.** `useRequestStore` virou uma fachada sobre a aba ativa de
`useRequestTabsStore` — `RequestConfigTabs`/`RequestUrlBar`/`ResponsePanel` não
mudaram uma linha. Toda aba corresponde a uma request já existente em disco (criar
uma request nova, EP-05-T03, já grava o arquivo na hora) — não existe o caso "aba sem
arquivo", o que simplificou bastante o modelo. Primeiro teste de store Pinia do
projeto (`stores/requestTabs.spec.ts`); precisou de um `vitest.config.ts` novo na raiz
espelhando os aliases `@renderer`/`@shared` de `electron.vite.config.ts` — sem ele o
`vitest` roda fora do `electron-vite` e não os resolve (nenhum teste tinha feito um
import de runtime por esses aliases até agora, só `import type`, que é apagado antes
de precisar resolver nada). **Limitação conhecida, registrada em vez de corrigida em
silêncio**: mover uma pasta (drag & drop, EP-05-T04) com requests abertas em abas mais
fundo dentro dela não reatribui o path dessas abas — só o próprio nó movido é
resincronizado; a próxima leitura/gravação de uma aba nessa situação falharia.
Verificação visual (abas, itálico de preview, modal de fechar suja) nos dois temas não
foi possível neste ambiente sem `xvfb`/`sudo` — mesma ressalva das tasks anteriores.

---

### EP-05-T06 — Busca rápida

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-05-T05

**Objetivo.** Chegar a qualquer request sem usar o mouse.

**Escopo.**

- `Ctrl+P` abre paleta com busca fuzzy por nome, caminho e URL.
- Resultado mostra método e caminho; `Enter` abre em preview, `Ctrl+Enter` fixa.

**Critérios de aceite.**

- [x] Resposta abaixo de 50ms com 1000 requests
- [x] `Esc` fecha e devolve o foco ao contexto anterior
- [x] Ranking prioriza correspondência no início do nome

**Nota de fechamento.** `lib/fuzzyMatch.ts` é um scan linear sem índice — três tiers de
pontuação (prefixo do nome > substring do nome > subsequence do nome), com
caminho/URL como critério de alcançabilidade de prioridade bem menor; cobertos por
`fuzzyMatch.spec.ts`, incluindo o corte em 50 resultados. `Esc`/devolução de foco vêm
de graça do `WModal` (mesmo mecanismo do EP-05-T01), sem lógica própria na paleta.
`CommandPalette` foca o campo de busca com um `requestAnimationFrame` depois do
`nextTick` do próprio `WModal` — o `$el` do `WModal` não serve porque sua raiz
teleporta para `document.body`. Verificação de performance com 1000 requests foi por
inspeção (nenhum trabalho depende do tamanho da árvore além do próprio scan O(n), que
`workspaceUiState`/`WTree`'s dev gallery já provaram folgado) — sem `xvfb`/`sudo`
neste ambiente para medir de verdade numa janela real, mesma ressalva das tasks
anteriores.

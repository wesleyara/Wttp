# EP-02 — Design system e shell de layout

**Status:** Pendente · **Alvo:** v0.1 · **Depende de:** EP-01

Transformar a paleta em tokens utilizáveis e construir o esqueleto da interface. Ao final, o app parece o Wttp — com sidebar, abas e painel de resposta vazios, mas com a estrutura definitiva.

Referência: [design-system.md](../design-system.md)

---

### EP-02-T01 — Tokens semânticos e dark mode

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-01-T05

**Objetivo.** Componentes estilizam por papel, não por cor.

**Escopo.**

- `darkMode: "class"` no Tailwind.
- CSS custom properties para os dois temas, no formato `rgb(var(--w-surface-1) / <alpha-value>)` para que `bg-surface-1/50` funcione.
- Expor os tokens da tabela de [design-system.md §2](../design-system.md) como cores Tailwind.
- Regra de lint ou script de verificação que impeça cor crua da escala em arquivos `.vue`.

**Critérios de aceite.**

- [ ] `bg-surface-2`, `text-muted`, `border-subtle`, `text-accent` e `ring-focus` funcionam
- [ ] Alternar a classe `dark` na raiz troca o tema inteiro sem recarregar
- [ ] Opacidade funciona (`bg-surface-3/60`)
- [ ] Usar `bluewood-900` num `.vue` é sinalizado

---

### EP-02-T02 — Cores de método e status

**Status:** Pendente · **Tamanho:** P · **Depende de:** EP-02-T01

**Objetivo.** Método HTTP e faixa de status têm cor consistente em todo o app.

**Escopo.**

- Tokens `method-get`…`method-options` e `status-2xx`…`status-5xx` nos dois temas.
- Helpers `methodToken(method)` e `statusToken(code)` em `@shared` — a mesma função serve badge, árvore e barra de URL.

**Critérios de aceite.**

- [ ] Contraste ≥ 4.5:1 contra `surface-1` e `surface-2`, nos dois temas, verificado
- [ ] Método desconhecido cai num token neutro em vez de quebrar

---

### EP-02-T03 — Componentes base `W*`

**Status:** Pendente · **Tamanho:** G · **Depende de:** EP-02-T02

**Objetivo.** O vocabulário visual do app existe antes da primeira tela de produto.

**Escopo.**

- `WButton`, `WInput`, `WSelect`, `WTabs`, `WKeyValueTable`, `WMethodBadge`, `WStatusBadge`, `WEmptyState`.
- Cada um com estados `default / hover / active / focus-visible / disabled` e aceitando `class`.
- Página de galeria em `pages/` (só em dev) exibindo todos os componentes e estados lado a lado nos dois temas.

**Critérios de aceite.**

- [ ] Todos navegáveis por teclado com foco visível
- [ ] Nenhum `outline: none` sem substituto
- [ ] Densidade conforme [design-system.md §4](../design-system.md): 28px em linhas, 32px em barras
- [ ] A galeria renderiza corretamente nos dois temas

**Fora de escopo.** `WTree`, `WSplitPane` e `WCodeEditor` — tasks próprias.

---

### EP-02-T04 — `WSplitPane` e shell de três painéis

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-02-T03

**Objetivo.** O layout definitivo do app existe.

**Escopo.**

- `WSplitPane` horizontal e vertical, com divisor arrastável, tamanho mínimo e colapso.
- Shell: sidebar (collections) · área central (abas de request) · painel de resposta.
- Tamanhos persistidos via IPC em `.wttp/ui-state.json` — nunca `localStorage`.

**Critérios de aceite.**

- [ ] Arrastar redimensiona suavemente, sem layout shift
- [ ] Tamanhos sobrevivem ao fechar e reabrir o app
- [ ] Divisor operável por teclado (setas quando focado)
- [ ] Painel de resposta alterna entre lateral e inferior

---

### EP-02-T05 — Toggle de tema e barra de status

**Status:** Pendente · **Tamanho:** P · **Depende de:** EP-02-T04

**Objetivo.** O usuário escolhe o tema e o app comunica seu estado.

**Escopo.**

- `useSettingsStore` com `theme: "dark" | "light" | "system"`, padrão `system` resolvendo para dark na primeira execução.
- Persistência via IPC nas configurações do app (não do workspace).
- Barra de status inferior: workspace ativo, environment ativo, e área para mensagens transitórias.

**Critérios de aceite.**

- [ ] Trocar o tema é instantâneo e não pisca ao iniciar o app
- [ ] Escolha sobrevive ao restart
- [ ] `system` acompanha a mudança do SO em tempo real

---

### EP-02-T06 — Janela e menu da aplicação

**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-02-T04

**Objetivo.** O app se comporta como aplicativo nativo em cada plataforma.

**Escopo.**

- Tamanho mínimo de janela, posição e dimensão restauradas entre sessões.
- Menu nativo com File / Edit / View / Help e os atalhos previstos (nova request, salvar, enviar, buscar).
- No macOS, papel de menu correto e `titleBarStyle: hiddenInset`.

**Critérios de aceite.**

- [ ] Posição e tamanho da janela restaurados; janela fora da tela é reposicionada
- [ ] Atalhos de menu disparam ações no renderer via IPC
- [ ] Fechar a última janela no macOS não encerra o app

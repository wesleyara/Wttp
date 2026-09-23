# EP-02 — Design system e shell de layout

**Status:** Concluída (verificação visual pendente) · **Alvo:** v0.1 · **Depende de:** EP-01

Transformar a paleta em tokens utilizáveis e construir o esqueleto da interface. Ao final, o app parece o Wttp — com sidebar, abas e painel de resposta vazios, mas com a estrutura definitiva.

> Todas as 6 tasks implementadas; `lint`, `typecheck`, `test` e `electron-vite build`
> passam limpos. O que não pôde ser verificado neste ambiente (sem `xvfb`/`sudo` para
> abrir uma janela Electron) está marcado `[~]` em cada task, com nota explicando o
> quê. Antes de considerar o épico fechado de verdade: rodar `yarn dev`, abrir a rota
> `/dev/gallery` e o shell principal, conferir dark e light, arrastar os divisores,
> testar os atalhos de menu e o restart do app.

Referência: [design-system.md](../design-system.md)

---

### EP-02-T01 — Tokens semânticos e dark mode

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-01-T05

**Objetivo.** Componentes estilizam por papel, não por cor.

**Escopo.**

- `darkMode: "class"` no Tailwind.
- CSS custom properties para os dois temas, no formato `rgb(var(--w-surface-1) / <alpha-value>)` para que `bg-surface-1/50` funcione.
- Expor os tokens da tabela de [design-system.md §2](../design-system.md) como cores Tailwind.
- Regra de lint ou script de verificação que impeça cor crua da escala em arquivos `.vue`.

**Critérios de aceite.**

- [x] `bg-surface-2`, `text-muted`, `border-subtle`, `text-accent` e `ring-focus` funcionam
- [x] Alternar a classe `dark` na raiz troca o tema inteiro sem recarregar
- [x] Opacidade funciona (`bg-surface-3/60`)
- [x] Usar `bluewood-900` num `.vue` é sinalizado

> **Nota de execução.** `:root` guarda o tema **light** (fallback do `darkMode:
> "class"` do Tailwind) e `.dark` sobrescreve — dark como padrão visual do produto é
> responsabilidade do `useSettingsStore` (EP-02-T05), que aplica a classe antes da
> primeira pintura. A regra anti-cor-crua usa `vue/no-restricted-class`, não
> `no-restricted-syntax` — o `no-restricted-syntax` do core do ESLint não enxerga o
> `templateBody` do `vue-eslint-parser` (só rules do próprio `eslint-plugin-vue`, via
> `defineTemplateBodyVisitor`, veem o template); verificado testando a regra num
> arquivo `.vue` descartável antes de confiar nela.

---

### EP-02-T02 — Cores de método e status

**Status:** Concluída · **Tamanho:** P · **Depende de:** EP-02-T01

**Objetivo.** Método HTTP e faixa de status têm cor consistente em todo o app.

**Escopo.**

- Tokens `method-get`…`method-options` e `status-2xx`…`status-5xx` nos dois temas.
- Helpers `methodToken(method)` e `statusToken(code)` em `@shared` — a mesma função serve badge, árvore e barra de URL.

**Critérios de aceite.**

- [~] Contraste ≥ 4.5:1 contra `surface-1` e `surface-2`, nos dois temas — **verificado, não totalmente atendido**: ver nota
- [x] Método desconhecido cai num token neutro em vez de quebrar

> **Notas de execução.**
>
> 1. **Desvio de local dos helpers.** `methodToken`/`statusToken` foram implementados em
>    `src/renderer/src/lib/http-tokens.ts`, não em `@shared` como o texto da task pede —
>    `@shared` é compilado nos três bundles e só pode conter `type`/`interface`, sem
>    runtime (regra crítica nº1 do `CLAUDE.md` raiz e do `src/main/CLAUDE.md`). Como só o
>    renderer consome esses helpers hoje, colocá-los em `@shared` violaria essa regra sem
>    ganho real. Testados em `http-tokens.spec.ts`.
> 2. **Contraste não atende integralmente.** Calculado WCAG 2.1 (luminância relativa) para
>    os 12 pares cor-de-domínio × superfície do tema correspondente, usando exatamente os
>    hex de [design-system.md §3](../design-system.md). Contra `surface-1` todos passam
>    (≥ 5.4:1). Contra `surface-2` **dark** (`bluewood-900`, `#2c3e50`), três ficam abaixo
>    de 4.5:1: `PATCH` 4.16:1, `DELETE`/`5xx` 3.97:1, `HEAD`/`OPTIONS` 4.28:1. Não ajustei
>    os hex unilateralmente — são os valores especificados no design system, e mudá-los é
>    uma decisão de produto. Reportando para o time decidir: escurecer levemente esses
>    três tons no dark, ou aceitar o desvio (eles só aparecem como texto sobre badge/árvore,
>    nunca como único portador de informação).

---

### EP-02-T03 — Componentes base `W*`

**Status:** Concluída · **Tamanho:** G · **Depende de:** EP-02-T02

**Objetivo.** O vocabulário visual do app existe antes da primeira tela de produto.

**Escopo.**

- `WButton`, `WInput`, `WSelect`, `WTabs`, `WKeyValueTable`, `WMethodBadge`, `WStatusBadge`, `WEmptyState`.
- Cada um com estados `default / hover / active / focus-visible / disabled` e aceitando `class`.
- Página de galeria em `pages/` (só em dev) exibindo todos os componentes e estados lado a lado nos dois temas.

**Critérios de aceite.**

- [x] Todos navegáveis por teclado com foco visível
- [x] Nenhum `outline: none` sem substituto
- [x] Densidade conforme [design-system.md §4](../design-system.md): 28px em linhas, 32px em barras
- [ ] A galeria renderiza corretamente nos dois temas — **não verificado**: ver nota

**Fora de escopo.** `WTree`, `WSplitPane` e `WCodeEditor` — tasks próprias.

> **Nota de execução.** Não consegui abrir uma janela Electron neste ambiente para
> tirar screenshot (sem `xvfb`, sem `sudo` interativo para instalar). A galeria está em
> `/dev/gallery` (só em dev, `router.ts`) com um botão "Toggle theme" que alterna a
> classe `dark` na raiz. **Pendente:** rodar `yarn dev`, abrir essa rota e conferir os
> dois temas manualmente antes de considerar o critério atendido.

---

### EP-02-T04 — `WSplitPane` e shell de três painéis

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-02-T03

**Objetivo.** O layout definitivo do app existe.

**Escopo.**

- `WSplitPane` horizontal e vertical, com divisor arrastável, tamanho mínimo e colapso.
- Shell: sidebar (collections) · área central (abas de request) · painel de resposta.
- Tamanhos persistidos via IPC em `.wttp/ui-state.json` — nunca `localStorage`.

**Critérios de aceite.**

- [~] Arrastar redimensiona suavemente, sem layout shift — implementado com `flex-basis`
      via ponteiro (sem reposicionar por `top`/`left`); não vi rodando, ver nota
- [~] Tamanhos sobrevivem ao fechar e reabrir o app — persistência via IPC verificada
      por teste de round-trip; não testei o ciclo completo abrir→fechar→reabrir do app
- [x] Divisor operável por teclado (setas quando focado)
- [x] Painel de resposta alterna entre lateral e inferior

> **Notas de execução.**
>
> 1. **Onde `.wttp/ui-state.json` realmente fica.** `.wttp/` é por-workspace
>    ([file-format.md](../file-format.md) linha 17) e o EP-04 (que dá ao app um
>    workspace de verdade) ainda não existe. Por ora o arquivo mora em
>    `app.getPath("userData")/ui-state.json`; `src/main/config/` foi desenhado para
>    migrar depois — só o `appDataDir.ts` precisa trocar quando o EP-04 chegar.
> 2. **Verificação visual pendente**, mesma limitação do EP-02-T03: sem `xvfb`/`sudo`
>    neste ambiente para abrir uma janela Electron. `yarn dev` renderiza o shell na
>    rota `/`; arrastar o divisor e fechar/reabrir o app ainda precisam de olho humano.

---

### EP-02-T05 — Toggle de tema e barra de status

**Status:** Concluída · **Tamanho:** P · **Depende de:** EP-02-T04

**Objetivo.** O usuário escolhe o tema e o app comunica seu estado.

**Escopo.**

- `useSettingsStore` com `theme: "dark" | "light" | "system"`, padrão `system` resolvendo para dark na primeira execução.
- Persistência via IPC nas configurações do app (não do workspace).
- Barra de status inferior: workspace ativo, environment ativo, e área para mensagens transitórias.

**Critérios de aceite.**

- [x] Trocar o tema é instantâneo (`watch` reativo aplica a classe na hora)
- [~] Não pisca ao iniciar — só parcialmente: ver nota
- [~] Escolha sobrevive ao restart — persistência testada por round-trip; ciclo completo do app não verificado (mesma limitação de ambiente das tasks anteriores)
- [x] `system` acompanha a mudança do SO em tempo real (`matchMedia(...).addEventListener("change", ...)`)

> **Nota de execução — flash no caminho `light`.** Sem acesso síncrono de
> `app.getPath` a partir do preload (só o processo main tem o módulo `electron.app`),
> não há como aplicar o tema persistido antes da primeira pintura sem um roundtrip IPC
> assíncrono. Resolvi isso parcialmente: `index.html` já nasce com `class="dark"`
> estática — o padrão do produto — e `main.ts` aguarda `useSettingsStore().load()`
> antes de montar a árvore Vue, corrigindo para `light` só quando necessário. Efeito:
> zero flash no caminho comum (dark), um flash breve só para quem já escolheu `light`
> ou está com o SO em light e `theme: "system"`. Não persegui uma solução 100%
> sync-safe (passaria por expor o caminho do `userData` ao preload via argv/env do
> processo, fora do escopo de uma task **P**) — reportando em vez de gold-plating.

---

### EP-02-T06 — Janela e menu da aplicação

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-02-T04

**Objetivo.** O app se comporta como aplicativo nativo em cada plataforma.

**Escopo.**

- Tamanho mínimo de janela, posição e dimensão restauradas entre sessões.
- Menu nativo com File / Edit / View / Help e os atalhos previstos (nova request, salvar, enviar, buscar).
- No macOS, papel de menu correto e `titleBarStyle: hiddenInset`.

**Critérios de aceite.**

- [~] Posição e tamanho da janela restaurados; janela fora da tela é reposicionada —
      lógica de "fora da tela" testada isoladamente (`geometry.spec.ts`); ciclo completo
      abrir→mover→fechar→reabrir do app não verificado (mesma limitação de ambiente)
- [~] Atalhos de menu disparam ações no renderer via IPC — cadeia completa implementada
      e tipada (main `Menu` → `webContents.send` → preload → `useMenuStore` →
      `StatusBar`); não vi o clique real disparar a mensagem, sem janela para testar
- [x] Fechar a última janela no macOS não encerra o app — já era verdade desde o EP-01
      (`app.on("window-all-closed", ...)` só chama `quit()` fora do `darwin`), inalterado

> **Notas de execução.**
>
> 1. **`menu:action` fica fora do `IpcContract`.** É um evento main → renderer sem
>    resposta (`webContents.send` / `ipcRenderer.on`), diferente do padrão
>    `invoke`/`result` que `IpcContract` tipa. Documentado onde é definido
>    (`src/shared/ipc.ts`, tipo `MenuAction`) e onde é exposto (`src/preload/index.ts`).
>    Quando o EP-03 introduzir `http:progress` (também `event ↓` na tabela de
>    architecture.md), vale generalizar esse padrão em vez de repeti-lo ad hoc.
> 2. Build de produção (`electron-vite build`) passou limpo para os três processos —
>    além de lint/typecheck/test, é a melhor verificação que consegui rodar sem uma
>    janela real.

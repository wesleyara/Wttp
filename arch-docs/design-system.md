# Design System

Fonte da verdade visual do Wttp. Este documento existe porque a paleta e a tipografia foram definidas antes do código — ele sobrevive a qualquer refatoração da base.

> **Regra número um:** componentes **nunca** referenciam uma cor crua (`bluewood-900`, `#18aae5`). Sempre um token semântico (`bg-surface-2`, `text-muted`, `border-subtle`). Cor crua só aparece na definição dos tokens, aqui e no `tailwind.config.js`.

---

## 1. Escalas base

Identidade herdada do projeto. Transcritas na íntegra — são a única coisa preservada do scaffold original.

### `bluewood` — escala neutra (superfícies, bordas, texto)

| Passo | Hex       |
| ----- | --------- |
| 50    | `#f5f7fa` |
| 100   | `#eaeff4` |
| 200   | `#cfdce8` |
| 300   | `#a6bfd3` |
| 400   | `#759cbb` |
| 500   | `#5480a3` |
| 600   | `#416788` |
| 700   | `#35526f` |
| 800   | `#2f475d` |
| 900   | `#2c3e50` |
| 950   | `#1d2834` |

### `brand-blue` — escala de acento (ações, foco, seleção)

| Passo | Hex       |
| ----- | --------- |
| 50    | `#f1f9fe` |
| 100   | `#e1f3fd` |
| 200   | `#bde6fa` |
| 300   | `#82d4f7` |
| 400   | `#40bef0` |
| 500   | `#18aae5` |
| 600   | `#0a85bf` |
| 700   | `#0a6a9a` |
| 800   | `#0c5a80` |
| 900   | `#104b6a` |
| 950   | `#0b2f46` |

### Tipografia

| Família            | Uso                             | Token         |
| ------------------ | ------------------------------- | ------------- |
| **Barlow**         | Títulos e headings              | `font-barlow` |
| **Inter**          | Texto de UI, labels, corpo      | `font-inter`  |
| **JetBrains Mono** | URLs, bodies, respostas, editor | `font-mono`   |

Carregadas localmente (`@fontsource/*`), **não** via Google Fonts — o app é desktop e precisa funcionar offline.

---

## 2. Tema

`darkMode: "class"`. **Dark é o padrão** — é o modo esperado numa ferramenta de desenvolvedor. O toggle persiste a escolha e respeita `prefers-color-scheme` na primeira execução.

Tokens definidos como CSS custom properties e expostos ao Tailwind via `rgb(var(--w-surface-1) / <alpha-value>)`, para que `bg-surface-1/50` funcione.

| Token           | Classe                      | Dark             | Light            |
| --------------- | --------------------------- | ---------------- | ---------------- |
| `surface-1`     | `bg-surface-1`              | `bluewood-950`   | `bluewood-50`    |
| `surface-2`     | `bg-surface-2`              | `bluewood-900`   | `#ffffff`        |
| `surface-3`     | `bg-surface-3`              | `bluewood-800`   | `bluewood-100`   |
| `border-subtle` | `border-subtle`             | `bluewood-800`   | `bluewood-200`   |
| `border-strong` | `border-strong`             | `bluewood-700`   | `bluewood-300`   |
| `text-1`        | `text-1`                    | `bluewood-100`   | `bluewood-900`   |
| `text-muted`    | `text-muted`                | `bluewood-400`   | `bluewood-500`   |
| `text-faint`    | `text-faint`                | `bluewood-600`   | `bluewood-400`   |
| `accent`        | `text-accent` / `bg-accent` | `brand-blue-500` | `brand-blue-600` |
| `accent-hover`  | —                           | `brand-blue-400` | `brand-blue-700` |
| `focus-ring`    | `ring-focus`                | `brand-blue-500` | `brand-blue-600` |

**Hierarquia de superfície:** `surface-1` é o fundo da aplicação; `surface-2` são os painéis (sidebar, área de request, painel de resposta); `surface-3` é hover, linha selecionada e aba ativa.

Tabelas e listas (`WTree`, `WKeyValueTable`) são monocromáticas — sem zebra striping. Testado em EP-06.1-T07 e revertido no mesmo épico: o overlay de baixa opacidade deixava as linhas com aparência "desabilitada".

---

## 3. Cores de domínio

Específicas de um cliente HTTP e por isso ausentes das escalas base. Cada uma tem par dark/light com contraste ≥ 4.5:1 contra a superfície correspondente.

### Métodos HTTP

Usadas no `WMethodBadge`, na barra de URL e na árvore de collections. Sempre **texto colorido sobre superfície neutra**, nunca fundo sólido — uma árvore com 40 requests vira um arco-íris ilegível.

| Método             | Dark      | Light     |
| ------------------ | --------- | --------- |
| `GET`              | `#40bef0` | `#0a6a9a` |
| `POST`             | `#4ade80` | `#15803d` |
| `PUT`              | `#fbbf24` | `#b45309` |
| `PATCH`            | `#c084fc` | `#7e22ce` |
| `DELETE`           | `#f87171` | `#b91c1c` |
| `HEAD` / `OPTIONS` | `#94a3b8` | `#475569` |

### Faixas de status

Usadas no `WStatusBadge` do painel de resposta.

| Faixa        | Dark      | Light     | Significado      |
| ------------ | --------- | --------- | ---------------- |
| `2xx`        | `#4ade80` | `#15803d` | sucesso          |
| `3xx`        | `#fbbf24` | `#b45309` | redirecionamento |
| `4xx`        | `#fb923c` | `#c2410c` | erro do cliente  |
| `5xx`        | `#f87171` | `#b91c1c` | erro do servidor |
| erro de rede | `#f87171` | `#b91c1c` | sem resposta     |

---

## 4. Escala tipográfica da aplicação

O Wttp é uma ferramenta densa, não uma landing page. O scaffold original definia `p → text-lg` e `h1 → text-6xl` via seletores de elemento globais — **isso não deve ser reintroduzido**. Nenhum estilo global por seletor de elemento; tudo por classe utilitária no componente.

| Papel                                    | Tamanho               | Peso    | Família        |
| ---------------------------------------- | --------------------- | ------- | -------------- |
| Label de campo, aba, item de árvore      | `text-xs` (12px)      | 500     | Inter          |
| Texto de UI padrão, input, botão         | `text-sm` (14px)      | 400/500 | Inter          |
| Título de painel, nome de request na aba | `text-sm` (14px)      | 600     | Barlow         |
| Título de modal / tela vazia             | `text-base`–`text-lg` | 600     | Barlow         |
| Código, URL, body, resposta              | `text-[13px]`         | 400     | JetBrains Mono |

**Densidade:** altura de linha de 28px para itens de árvore e linhas de tabela chave-valor, 32px para barras de ferramentas e abas. Raio de borda padrão `rounded-md` (6px).

---

## 5. Componentes base (`W*`)

Construídos no **EP-02**, antes de qualquer tela de produto. Todos aceitam `class` para composição e expõem estados `default / hover / active / focus-visible / disabled`.

| Componente       | Papel                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| `WButton`        | Variantes `primary`, `secondary`, `ghost`, `danger`; tamanhos `sm`, `md`                |
| `WInput`         | Input de texto com slots de prefixo/sufixo e estado de erro                             |
| `WSelect`        | Select estilizado, usado no seletor de método e de environment                          |
| `WTabs`          | Abas horizontais; base tanto das abas de request quanto das de params/headers/body/auth |
| `WTree`          | Árvore virtualizada de collections, com teclado, drag & drop e menu de contexto         |
| `WKeyValueTable` | Linhas `enabled / name / value / descrição`, usada em query, headers e variáveis        |
| `WSplitPane`     | Divisor arrastável com tamanho persistido                                               |
| `WCodeEditor`    | Wrapper do CodeMirror 6 com o tema derivado destes tokens                               |
| `WMethodBadge`   | Método HTTP colorido                                                                    |
| `WStatusBadge`   | Código de status + faixa de cor                                                         |
| `WEmptyState`    | Ícone, título, descrição e ação — para árvore vazia, sem resposta, sem workspace        |
| `WModal`         | Overlay com painel focado, `Esc` fecha, foco preso e devolvido ao fechar (EP-05-T01)    |
| `WContextMenu`   | Menu de contexto posicionado por coordenadas, fecha em `Esc`/clique fora (EP-05-T03)    |

### Editor de código

CodeMirror 6 com tema próprio derivado dos tokens acima — nunca um tema pronto de terceiros, que traria uma segunda paleta para dentro do app. Linguagens: JSON, JavaScript, XML, HTML. Autocomplete de `{{variavel}}` alimentado pelo environment ativo, com variável não resolvida sublinhada em `4xx`.

---

## 6. Acessibilidade

- Contraste mínimo 4.5:1 para texto e 3:1 para bordas e ícones significativos, nos dois temas.
- `focus-visible` sempre visível: anel de 2px em `focus-ring` com offset de 2px. Nunca `outline: none` sem substituto.
- Cor nunca é o único portador de informação: o método aparece como texto (`GET`), o status como número (`200`), o estado de erro tem ícone além da cor.
- Alvos de clique com no mínimo 24×24px de área efetiva, mesmo quando o visual é menor.

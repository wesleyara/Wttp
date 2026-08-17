# EP-01 — Fundação electron-vite

**Status:** Concluída · **Alvo:** v0.1

Substituir o scaffold `Wttp.Frontend/` por uma base electron-vite funcional, com os três processos comunicando e o ferramental de qualidade ligado. Nenhuma funcionalidade de produto entra aqui — o entregável é um app que abre uma janela vazia, com tudo o que os épicos seguintes precisam já no lugar.

Referências: [architecture.md](../architecture.md) · [conventions.md](../conventions.md)

---

### EP-01-T01 — Preservar tokens visuais e remover o scaffold antigo

**Status:** Concluída · **Tamanho:** P · **Depende de:** —

**Objetivo.** A pasta do scaffold antigo deixa de existir sem que a identidade visual se perca.

> **Nota de execução.** Quando a task foi executada, o scaffold já não existia — nem no disco, nem em nenhum commit (o repositório começa em `a930425`, contendo apenas `docs/` e `.claude/`). A conferência dos 22 hexes contra o `tailwind.config.js` original **não pôde ser feita**, por falta do arquivo. [docs/design-system.md](../design-system.md) passa a ser a única fonte da verdade da paleta, e é dele que o `tailwind.config.js` do EP-01-T05 é derivado.

**Escopo.**

- ~~Conferir as escalas `bluewood` e `brand-blue` contra o `tailwind.config.js` original.~~ Impossível — arquivo inexistente.
- Remover o scaffold por completo.
- Garantir que nenhum documento aponte para a pasta antiga.

**Critérios de aceite.**

- [ ] ~~Os 22 valores hex do design system conferem com o `tailwind.config.js` original~~ — não verificável, ver nota
- [x] A pasta do scaffold antigo não existe mais
- [x] Nenhum arquivo do repositório, fora desta nota histórica, referencia o scaffold antigo

**Fora de escopo.** Reaproveitar qualquer código ou estilo do scaffold — só as cores e as famílias tipográficas sobrevivem.

---

### EP-01-T02 — Gerar o scaffold electron-vite

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-01-T01

**Objetivo.** `yarn dev` abre a janela do Electron a partir do template oficial `vue-ts`.

**Escopo.**

- Gerar em pasta temporária e mover para a raiz — o gerador exige diretório vazio e a raiz já tem `docs/`, `CLAUDE.md` e `README.md`, que **não podem ser sobrescritos**:
  ```sh
  yarn create @quick-start/electron wttp-scaffold --template vue-ts
  ```
  Responder **sim** ao prompt do updater.
- Mover para a raiz preservando os arquivos existentes; conferir o merge do `.gitignore`.
- Remover a demo: `Versions.vue`, assets do template, conteúdo de `App.vue`.
- Renomear identidade: `name`, `productName`, `appId` (`com.wttp.app`), `description`, `author` no `package.json` e `electron-builder.yml`; título da janela.
- Trocar os ícones em `build/` e `resources/` por placeholders do Wttp.
- ~~Primeiro commit do repositório (hoje não há nenhum).~~ Já existia o commit `a930425`; a task virou um commit normal.

**Critérios de aceite.**

- [x] `yarn && yarn dev` abre uma janela vazia sem erro no console
- [x] `yarn typecheck` e `yarn lint` passam
- [x] `docs/`, `CLAUDE.md` e `README.md` continuam intactos
- [x] Nenhum resquício de "electron-app" ou "Versions" no repositório

> **Notas de execução.** Os prompts do gerador são toggles que exigem TTY; usamos `--skip` e aplicamos à mão exatamente o que a opção do updater faz (`dev-app-update.yml` + dependência `electron-updater`). A URL de publicação segue placeholder — é assunto do EP-11. Fora do escopo escrito, mas feito por serem óbvios: `version` em `0.1.0`, `.gitignore` com `.wttp/`, `font-src 'self' data:` no CSP (necessário para as fontes locais do EP-01-T05) e remoção dos entitlements de câmera e microfone do macOS, que um cliente HTTP não usa.

**Fora de escopo.** Tailwind, Pinia, router — tasks seguintes.

---

### EP-01-T03 — `src/shared` e alias `@shared`

**Status:** Concluída · **Tamanho:** P · **Depende de:** EP-01-T02

**Objetivo.** Os três processos importam tipos de um único lugar.

**Escopo.**

- Criar `src/shared/` com `ipc.ts` (nomes de canal e `WttpError`) e `index.ts`.
- Registrar o alias `@shared` nos **três** blocos de `electron.vite.config.ts` e em `tsconfig.node.json` + `tsconfig.web.json`.

**Critérios de aceite.**

- [x] Um `import type { WttpError } from "@shared"` compila em main, preload e renderer
- [x] `yarn build` gera os três bundles sem erro de resolução
- [x] `src/shared` não contém nenhum valor em runtime, só tipos e constantes de string

---

### EP-01-T04 — Registro tipado de IPC com canal `app:ping`

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-01-T03

**Objetivo.** A cadeia main → preload → renderer está provada de ponta a ponta e tipada.

**Escopo.**

- `src/shared/ipc.ts`: mapa `IpcContract` associando canal a `{ payload, result }`; helpers `invoke`/`handle` que derivam os tipos desse mapa.
- `src/main/ipc/`: registro de handlers com validação de payload e mapeamento de exceção para `WttpError`.
- `src/preload/index.ts`: expor `window.wttp` via `contextBridge`; declarar o tipo em `src/preload/index.d.ts`.
- Canal `app:ping` retornando `{ version, platform }`, consumido por um componente temporário.

**Critérios de aceite.**

- [x] Chamar um canal inexistente ou com payload de tipo errado falha no `typecheck`
- [x] O renderer exibe o retorno de `app:ping`
- [x] Um erro lançado no handler chega ao renderer como `WttpError`, sem stack do Node
- [x] `contextIsolation: true` e `nodeIntegration: false` confirmados na `BrowserWindow`

> **Nota de execução — bug real encontrado e corrigido.** `ipcRenderer.invoke` prefixa a mensagem do erro rejeitado com `Error invoking remote method 'canal': Error: <json>`; o primeiro `unwrapWttpError` fazia `JSON.parse` na mensagem inteira, então esse prefixo quebrava o parse e todo erro chegava como `UNKNOWN` — perdendo o `code`. Verificado lançando um erro de teste no handler `app:ping`, rodando o app empacotado com `--remote-debugging-port` e chamando `window.wttp.app.ping()` via CDP. Corrigido extraindo só o trecho `{...}` da mensagem (`src/preload/ipc.ts`), com teste de regressão em `src/preload/ipc.spec.ts`.

---

### EP-01-T05 — Tailwind e fontes no renderer

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-01-T02

**Objetivo.** O renderer estiliza com Tailwind usando a paleta preservada, funcionando offline.

**Escopo.**

- Instalar e configurar Tailwind + PostCSS no renderer.
- `tailwind.config.js` com as escalas `bluewood` e `brand-blue` de [design-system.md](../design-system.md), e `fontFamily` para `barlow`, `inter` e `mono` (JetBrains Mono).
- Fontes via `@fontsource/*` — **nunca** Google Fonts por link; o app precisa funcionar sem internet.
- `assets/main.css` só com as diretivas `@tailwind` e o reset. Nenhum estilo global por seletor de elemento.

**Critérios de aceite.**

- [x] Utilitários Tailwind funcionam em componentes `.vue`
- [x] `font-barlow`, `font-inter` e `font-mono` renderizam as fontes corretas com a rede desligada
- [x] Nenhum `<link>` para host externo no `index.html`
- [x] Nenhuma regra CSS global aplicada a seletor de elemento

> **Nota de execução.** Tailwind fixado em `^3` (não v4) porque o design-system.md documenta `tailwind.config.js` clássico e `darkMode: "class"`, e `eslint-plugin-tailwindcss` só tem major estável compatível com v3 (a 4.x exige Tailwind v4). Verificado sem screenshot pixel-a-pixel — a captura via CDP travava neste ambiente (compositor sem GPU) — lendo `getComputedStyle` e `document.fonts` do app empacotado rodando com `--remote-debugging-port`: `bg-bluewood-950` resolveu para `rgb(29, 40, 52)` (`#1d2834`), `text-brand-blue-500` para `rgb(24, 170, 229)` (`#18aae5`) e `font-mono` para `"JetBrains Mono"` — os três batendo exatamente com design-system.md — e `document.fonts` listou Inter, Barlow e JetBrains Mono carregadas, sem nenhum `<link>` externo no HTML servido.

**Fora de escopo.** Tokens semânticos e dark mode — EP-02.

---

### EP-01-T06 — Pinia e vue-router

**Status:** Concluída · **Tamanho:** P · **Depende de:** EP-01-T02

**Objetivo.** Estado e navegação prontos para os épicos de produto.

**Escopo.**

- Instalar e registrar Pinia e vue-router (`createWebHashHistory` — `createWebHistory` não funciona com `file://` no app empacotado).
- `src/renderer/src/router.ts` com uma rota raiz; pastas `stores/`, `composables/` e `pages/` criadas.

**Critérios de aceite.**

- [x] Navegação funciona tanto em `yarn dev` quanto no build empacotado
- [x] Uma store Pinia de exemplo é lida por um componente
- [x] Estrutura de pastas conforme [conventions.md](../conventions.md)

> **Nota de execução.** `pinia` resolveu em `^4.0.3` e `vue-router` em `^5.2.0` — majors mais recentes que os "v2/v4" costumeiramente associados a Vue 3, mas com `peerDependencies` compatíveis com Vue `^3.5.34` e Vite `^7`; a API usada (`defineStore` estilo setup, `createWebHashHistory`) é a mesma. `composables/` ainda não tem nenhum `useX()` real — só um `.gitkeep`, já que nada no escopo desta task precisa de um.

---

### EP-01-T07 — Lint, formatação e Vitest

**Status:** Concluída · **Tamanho:** P · **Depende de:** EP-01-T05

**Objetivo.** As convenções são obrigatórias por ferramenta, não por disciplina.

**Escopo.**

- Estender `eslint.config.mjs` com `eslint-plugin-perfectionist` (sort-imports) e `eslint-plugin-tailwindcss`, ambos como `error`.
- Alinhar `.prettierrc.yaml` com [conventions.md](../conventions.md).
- Instalar Vitest, script `test`, e um teste trivial em `src/main/` provando que o setup roda sem Electron.

**Critérios de aceite.**

- [x] `yarn lint` acusa import fora de ordem e classe Tailwind fora de ordem
- [x] `yarn test` roda e passa
- [x] `yarn typecheck` cobre main/preload e renderer

> **Notas de execução.** `yarn add` do classic Yarn quebrava com "Invariant Violation: could not find a copy of vite to link" ao instalar `vitest`; contornado instalando com `npm install --no-save`, registrando as versões exatas em `package.json` à mão e rodando `yarn install` para reconciliar o `yarn.lock`. `eslint-plugin-tailwindcss` na major mais recente (4.x) exige Tailwind v4; fixado em `^3.18.3`, compatível com o `tailwindcss@^3` do EP-01-T05. O teste trivial foi em `src/main/ipc/errors.spec.ts` (não existe `http/`/`storage/`/`importers/` ainda); ganhou um segundo arquivo, `src/preload/ipc.spec.ts`, para travar a correção de bug relatada na EP-01-T04.

---

### EP-01-T08 — `CLAUDE.md` dos processos

**Status:** Concluída · **Tamanho:** P · **Depende de:** EP-01-T04, EP-01-T06

**Objetivo.** Cada processo carrega seu próprio contexto.

**Escopo.**

- `src/main/CLAUDE.md`: camadas, `ipc/` fino, formato de erro, o que nunca vai para o renderer.
- `src/renderer/CLAUDE.md`: estrutura, convenções Vue/Pinia, consumo via store (nunca `window.wttp` direto no componente), tokens de estilo.
- Atualizar a seção "Estado do projeto" do `CLAUDE.md` raiz.

**Critérios de aceite.**

- [x] Os dois arquivos existem e refletem a estrutura real pós-scaffold
- [x] Nenhuma referência a `Wttp.Frontend`, `Wttp.Desktop` ou `Wttp.Shared` em nenhum documento (fora da menção histórica na abertura deste épico e desta própria linha de critério)

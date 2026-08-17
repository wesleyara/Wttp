# EP-01 — Fundação electron-vite

**Status:** Pendente · **Alvo:** v0.1

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
**Status:** Pendente · **Tamanho:** P · **Depende de:** EP-01-T02

**Objetivo.** Os três processos importam tipos de um único lugar.

**Escopo.**
- Criar `src/shared/` com `ipc.ts` (nomes de canal e `WttpError`) e `index.ts`.
- Registrar o alias `@shared` nos **três** blocos de `electron.vite.config.ts` e em `tsconfig.node.json` + `tsconfig.web.json`.

**Critérios de aceite.**
- [ ] Um `import type { WttpError } from "@shared"` compila em main, preload e renderer
- [ ] `yarn build` gera os três bundles sem erro de resolução
- [ ] `src/shared` não contém nenhum valor em runtime, só tipos e constantes de string

---

### EP-01-T04 — Registro tipado de IPC com canal `app:ping`
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-01-T03

**Objetivo.** A cadeia main → preload → renderer está provada de ponta a ponta e tipada.

**Escopo.**
- `src/shared/ipc.ts`: mapa `IpcContract` associando canal a `{ payload, result }`; helpers `invoke`/`handle` que derivam os tipos desse mapa.
- `src/main/ipc/`: registro de handlers com validação de payload e mapeamento de exceção para `WttpError`.
- `src/preload/index.ts`: expor `window.wttp` via `contextBridge`; declarar o tipo em `src/preload/index.d.ts`.
- Canal `app:ping` retornando `{ version, platform }`, consumido por um componente temporário.

**Critérios de aceite.**
- [ ] Chamar um canal inexistente ou com payload de tipo errado falha no `typecheck`
- [ ] O renderer exibe o retorno de `app:ping`
- [ ] Um erro lançado no handler chega ao renderer como `WttpError`, sem stack do Node
- [ ] `contextIsolation: true` e `nodeIntegration: false` confirmados na `BrowserWindow`

---

### EP-01-T05 — Tailwind e fontes no renderer
**Status:** Pendente · **Tamanho:** M · **Depende de:** EP-01-T02

**Objetivo.** O renderer estiliza com Tailwind usando a paleta preservada, funcionando offline.

**Escopo.**
- Instalar e configurar Tailwind + PostCSS no renderer.
- `tailwind.config.js` com as escalas `bluewood` e `brand-blue` de [design-system.md](../design-system.md), e `fontFamily` para `barlow`, `inter` e `mono` (JetBrains Mono).
- Fontes via `@fontsource/*` — **nunca** Google Fonts por link; o app precisa funcionar sem internet.
- `assets/main.css` só com as diretivas `@tailwind` e o reset. Nenhum estilo global por seletor de elemento.

**Critérios de aceite.**
- [ ] Utilitários Tailwind funcionam em componentes `.vue`
- [ ] `font-barlow`, `font-inter` e `font-mono` renderizam as fontes corretas com a rede desligada
- [ ] Nenhum `<link>` para host externo no `index.html`
- [ ] Nenhuma regra CSS global aplicada a seletor de elemento

**Fora de escopo.** Tokens semânticos e dark mode — EP-02.

---

### EP-01-T06 — Pinia e vue-router
**Status:** Pendente · **Tamanho:** P · **Depende de:** EP-01-T02

**Objetivo.** Estado e navegação prontos para os épicos de produto.

**Escopo.**
- Instalar e registrar Pinia e vue-router (`createWebHashHistory` — `createWebHistory` não funciona com `file://` no app empacotado).
- `src/renderer/src/router.ts` com uma rota raiz; pastas `stores/`, `composables/` e `pages/` criadas.

**Critérios de aceite.**
- [ ] Navegação funciona tanto em `yarn dev` quanto no build empacotado
- [ ] Uma store Pinia de exemplo é lida por um componente
- [ ] Estrutura de pastas conforme [conventions.md](../conventions.md)

---

### EP-01-T07 — Lint, formatação e Vitest
**Status:** Pendente · **Tamanho:** P · **Depende de:** EP-01-T05

**Objetivo.** As convenções são obrigatórias por ferramenta, não por disciplina.

**Escopo.**
- Estender `eslint.config.mjs` com `eslint-plugin-perfectionist` (sort-imports) e `eslint-plugin-tailwindcss`, ambos como `error`.
- Alinhar `.prettierrc.yaml` com [conventions.md](../conventions.md).
- Instalar Vitest, script `test`, e um teste trivial em `src/main/` provando que o setup roda sem Electron.

**Critérios de aceite.**
- [ ] `yarn lint` acusa import fora de ordem e classe Tailwind fora de ordem
- [ ] `yarn test` roda e passa
- [ ] `yarn typecheck` cobre main/preload e renderer

---

### EP-01-T08 — `CLAUDE.md` dos processos
**Status:** Pendente · **Tamanho:** P · **Depende de:** EP-01-T04, EP-01-T06

**Objetivo.** Cada processo carrega seu próprio contexto.

**Escopo.**
- `src/main/CLAUDE.md`: camadas, `ipc/` fino, formato de erro, o que nunca vai para o renderer.
- `src/renderer/CLAUDE.md`: estrutura, convenções Vue/Pinia, consumo via store (nunca `window.wttp` direto no componente), tokens de estilo.
- Atualizar a seção "Estado do projeto" do `CLAUDE.md` raiz.

**Critérios de aceite.**
- [ ] Os dois arquivos existem e refletem a estrutura real pós-scaffold
- [ ] Nenhuma referência a `Wttp.Frontend`, `Wttp.Desktop` ou `Wttp.Shared` em nenhum documento

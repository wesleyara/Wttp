# `src/renderer`

Vue 3 + Pinia. Só UI e estado — zero I/O. Referência completa: [docs/conventions.md](../../docs/conventions.md) e [docs/design-system.md](../../docs/design-system.md).

---

## Estrutura

```
src/renderer/
├── index.html
└── src/
    ├── main.ts
    ├── App.vue
    ├── router.ts
    ├── assets/       estilos globais (Tailwind), fontes
    ├── components/   componentes de UI base (W*) e de domínio
    ├── composables/  useX() reutilizáveis
    ├── pages/        telas roteadas, sufixo Page
    └── stores/       Pinia, um arquivo por domínio
```

Alias `@renderer` → `src/renderer/src`; `@shared` também disponível aqui.

## Regra de ouro: renderer nunca importa `node:*` nem `electron`

Todo acesso a disco, rede ou SO passa por `window.wttp.*`. Falta um canal? A resposta é sempre um canal IPC novo, nunca uma exceção — use a skill `wttp-ipc-channel`.

## Componente nunca chama `window.wttp.*` direto

A store do domínio chama; o componente lê a store. Isso mantém um único ponto por domínio tratando erro (`WttpError`) e estado de carregamento. Exemplo mínimo em `stores/app.ts` — `ping()` chama `window.wttp.app.ping()`, guarda `info` ou `error`; `HomePage.vue` só lê `appStore.info` / `appStore.error`.

## Vue

- `<script setup lang="ts">` sempre. Ordem dos blocos: `script → template → style`.
- Props type-only (`defineProps<{...}>()`), nunca declaração em runtime.
- Prefixo `W` para componentes de UI base (`WButton`); sem prefixo para componentes de domínio (`RequestUrlBar`). Sufixo `Page` para telas roteadas.
- Store Pinia estilo setup (`defineStore("dominio", () => {...})`), uma por domínio.

Componente novo ou edição de `.vue`? Use a skill `wttp-vue-component`.

## Estilo

- Tailwind com utilitários inline no template. Nenhum CSS global por seletor de elemento — nem em `assets/main.css`, nem em `<style>`.
- **Só tokens semânticos** (`bg-surface-2`, `text-muted`) a partir do EP-02. Hoje, antes dos tokens existirem, `bg-bluewood-950` e `text-brand-blue-500` (as escalas cruas de `tailwind.config.js`) ainda aparecem no `HomePage.vue` de exemplo — isso vira token semântico assim que o EP-02 os define.
- Fontes via `@fontsource/*` (`assets/fonts.ts`), nunca `<link>` para host externo — o app precisa abrir offline.
- Todo componente novo é conferido nos dois temas (dark e light) antes de considerado pronto.

# Convenções

Regras de código do Wttp. Curtas e verificáveis — o que não estiver aqui segue o que o lint já obriga.

---

## Idioma

| Onde                                                         | Idioma     |
| ------------------------------------------------------------ | ---------- |
| `docs/`, backlog, comentários explicativos longos            | **PT-BR**  |
| Código, tipos, nomes de arquivo, strings de UI, commits, PRs | **Inglês** |

O produto é open source e a UI precisa ser acessível a contribuidores de fora. A documentação interna é em português porque é onde o time pensa.

### Strings de UI (i18n)

**Nenhuma string de UI literal em componente ou store** (EP-08.1-T06). Todo texto que o
usuário lê — rótulo, placeholder, `title`, `aria-label`, mensagem de toast, empty state —
passa por `vue-i18n`:

- Componente: `const { t } = useI18n()` e `t("area.chave")` no template/script. Fora de
  componente (stores, `lib/`): `i18n.global.t(...)`, avaliado na hora do uso, nunca no
  carregamento do módulo — senão a troca de idioma não chega.
- Chaves em `src/renderer/src/i18n/`: `en.ts` é a fonte e o fallback; `pt-BR.ts` é tipado
  como `MessageSchema` (o `typecheck` falha se faltar chave) e os placeholders `{x}`
  precisam bater (`i18n.spec.ts`). Agrupe por área (`tabs.*`, `response.*`, `prefs.*`,
  `toast.*`); reuse `common.*` em vez de repetir "Cancel"/"Save".
- Texto interpolado usa `{placeholder}`, nunca concatenação; plural são duas chaves
  (`...One`/`...Other`) — as línguas divergem em como pluralizam.
- Listas de opções com rótulo (`WSelect`, menus) são `computed`, para reagir à troca de
  idioma sem reiniciar.
- **Não se traduz:** dado do usuário (nomes de request/collection, valores), código,
  nomes de método/header HTTP e a sintaxe `{{variável}}`. Nomes padrão gravados em disco
  (ex.: "New request") também são dado, não UI.
- Fora de escopo por ora: mensagens de `WttpError` vindas do main (o contrato IPC carrega a
  string pronta em inglês) e os rótulos do menu nativo.

---

## Estrutura

```
src/
├── main/        Node — ver arch-docs/architecture.md §3
├── preload/     bridge; nada além de contextBridge
├── renderer/
│   ├── index.html
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── router.ts
│       ├── assets/       estilos globais, fontes
│       ├── components/   componentes de UI base (W*) e de domínio
│       ├── composables/  useX() reutilizáveis
│       ├── pages/        telas roteadas, sufixo Page
│       └── stores/       Pinia, um arquivo por domínio
└── shared/      tipos do contrato IPC — sem runtime
```

### Aliases

| Alias       | Aponta para        | Disponível em           |
| ----------- | ------------------ | ----------------------- |
| `@renderer` | `src/renderer/src` | renderer                |
| `@shared`   | `src/shared`       | main, preload, renderer |

Declarados em `electron.vite.config.ts` (nos três blocos) **e** em `tsconfig.node.json` + `tsconfig.web.json`. Adicionar em um só lugar quebra ou o build ou o typecheck.

`src/shared` só pode conter `type`, `interface` e constantes de string. Nenhuma função, nenhum import de Node ou de Vue — ela é compilada nos três bundles.

---

## Vue

- `<script setup lang="ts">` sempre. Ordem dos blocos: `script → template → style`.
- Props type-only: `defineProps<{ label: string; disabled?: boolean }>()`. Nunca declaração em runtime.
- `withDefaults` para valores padrão; emits com `defineEmits<{ ... }>()`.
- Nomes em PascalCase, um componente por arquivo.
- **Prefixo `W`** para componentes de UI base reutilizáveis (`WButton`, `WTree`). Componentes de domínio não levam prefixo (`RequestUrlBar`, `ResponsePanel`).
- **Sufixo `Page`** para telas roteadas, em `pages/`.
- Composables começam com `use` e vivem em `composables/`.

### Estado

Uma store Pinia por domínio, no estilo setup:

```ts
export const useWorkspaceStore = defineStore("workspace", () => {
  const tree = ref<WorkspaceTree | null>(null);
  // ...
  return { tree, open, close };
});
```

Stores previstas: `useWorkspaceStore`, `useRequestTabsStore`, `useEnvironmentStore`, `useResponseStore`, `useSettingsStore`.

Estado que precisa sobreviver ao fechamento do app vai para `.wttp/ui-state.json` via IPC — nunca `localStorage`, que é invisível ao usuário e não acompanha o workspace.

### Acesso a dados

O componente nunca chama `window.wttp.*` direto. A store chama; o componente lê a store. Isso mantém um único ponto por domínio para tratar erro e estado de carregamento.

---

## Estilo

- Tailwind com utilitários inline no template. Sem CSS global por seletor de elemento.
- **Somente tokens semânticos** (`bg-surface-2`, `text-muted`, `border-subtle`). Cor crua da escala só em `tailwind.config.js`. Ver [design-system.md](design-system.md).
- Todo componente novo é conferido nos dois temas antes de considerado pronto.

---

## Lint e formatação

Base do template electron-vite (`eslint.config.mjs` + `.prettierrc.yaml`), estendida com:

- `eslint-plugin-perfectionist` — `sort-imports`, `sort-named-imports` como `error`.
- `eslint-plugin-tailwindcss` — `classnames-order`, `enforces-shorthand`, `no-contradicting-classname` como `error`.

Prettier: aspas duplas, 2 espaços, ponto e vírgula, `printWidth: 100`, `trailingComma: "all"`, `arrowParens: "avoid"`.

`yarn lint` e `yarn typecheck` passam antes de qualquer commit. Não há exceção "arrumo depois".

---

## Testes

- **Vitest** para `main/http`, `main/storage` e `main/importers` — são puros e testáveis sem Electron. Cobertura obrigatória nestes três.
- Todo formato de arquivo tem **teste de round-trip**: ler → serializar → comparar bytes.
- Todo importador tem **fixture real** (arquivo exportado de verdade do Postman/Insomnia) e teste de snapshot.
- **Playwright** para os fluxos críticos ponta a ponta, não para cobrir tudo.

---

## Git

- **Conventional Commits** em inglês: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Branch por task: `feat/EP-03-T02-http-engine`.
- Referenciar a task no corpo do commit: `Refs EP-03-T02`.
- Um commit não deixa o repositório com lint ou typecheck quebrado.

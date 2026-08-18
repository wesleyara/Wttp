# Wttp

Cliente HTTP local e open source — desenvolver, testar e documentar APIs. Desktop app (Electron + Vue 3), com workspaces, collections, environments e variáveis persistidos em **arquivos YAML versionáveis** na máquina do usuário.

Visão do produto: [docs/overview.md](docs/overview.md).

---

## Estado do projeto

**Pré-MVP.** A fundação (**EP-01**), o design system/shell (**EP-02**), o núcleo HTTP
(**EP-03**), a persistência em disco (**EP-04**), workspaces/collections/tabs
(**EP-05**) e environments/variáveis (**EP-06**) estão prontos: electron-vite com os
três processos comunicando, IPC tipado, tokens semânticos com dark mode, os
componentes base `W*` (agora também `WModal`, `WTree`, `WContextMenu`), o shell de três
painéis (`WSplitPane`) com tamanhos persistidos, tema com `useSettingsStore`, menu
nativo com atalhos, a engine HTTP (`src/main/http`, todos os métodos e tipos de body,
redirects, timing, cancelamento), `WCodeEditor` (CodeMirror 6), a UI de montar/
disparar/inspecionar uma request (`RequestUrlBar`, `RequestConfigTabs`,
`ResponsePanel`), todo o storage do workspace (`src/main/storage`): parser/serializer
YAML com round-trip byte-a-byte, validação de schema, versionamento e migração, leitura
e escrita atômica da árvore inteira (`node:*`, `workspace:*`), watcher de filesystem que
reflete edições externas na UI sem entrar em loop com o próprio save, segredos de
environment via `safeStorage` do SO com fallback em texto avisado (`src/main/secrets`),
a UI completa de workspace: tela inicial de abrir/criar/recentes (`WorkspaceLanding`),
árvore virtualizada de collections com CRUD/drag & drop/menu de contexto (`WTree`), abas
de request independentes com sessão restaurada (`useRequestTabsStore`,
`.wttp/ui-state.json`) e paleta de busca rápida (`CommandPalette`, `Ctrl+P`), e agora o
resolvedor de `{{variável}}` (`src/main/http/resolver.ts`, precedência
runtime>environment>collection/pasta>workspace>dinâmicas, ciclo detectado, `$uuid`/
`$timestamp`/`$isoTimestamp`/`$randomInt`), CRUD de environments com segredos roteados
para o keychain (`env:*`, `EnvironmentEditorModal`), o seletor de environment ativo no
`StatusBar` persistido por workspace, e realce/tooltip/autocomplete de variável na URL,
params, headers e body — `useRequestTabsStore.send()` resolve a request inteira antes
de disparar e pede confirmação quando sobra alguma `{{var}}` não resolvida.
`useRequestStore` continua uma fachada sobre a aba ativa — nenhum componente de EP-03
precisou mudar. Auth e scripts ainda são placeholder — chegam em EP-07/EP-09. A
verificação visual de EP-02/EP-03/EP-05/EP-06 (dois temas, interações reais numa
janela) ainda não foi feita — este ambiente de desenvolvimento não tem `xvfb`/`sudo`
para abrir uma; pendente antes de considerar qualquer um dos quatro épicos fechado de
fato. Ver nota no topo de [EP-02](docs/backlog/EP-02-design-system.md) e as notas por
task em [EP-03](docs/backlog/EP-03-nucleo-http.md),
[EP-05](docs/backlog/EP-05-workspaces-collections.md) e
[EP-06](docs/backlog/EP-06-environments-variaveis.md).

Trabalho corrente: [docs/backlog/README.md](docs/backlog/README.md) → épico **EP-07**.

---

## Estrutura

```
src/
├── main/        Node — HTTP engine, storage, scripts, importers, IPC
├── preload/     bridge contextBridge — única superfície do renderer
├── renderer/    Vue 3 + Pinia — só UI e estado
└── shared/      tipos do contrato IPC (sem runtime)
docs/            referência técnica e backlog
.claude/skills/  skills dos fluxos repetitivos
```

Aliases: `@renderer` → `src/renderer/src`, `@shared` → `src/shared`.

---

## Comandos

```sh
yarn                 # instalar
yarn dev             # Electron + Vite com HMR
yarn lint            # ESLint
yarn typecheck       # typecheck:node + typecheck:web
yarn test            # Vitest
yarn build           # bundle dos três processos
yarn build:linux     # instalador (também :win, :mac)
```

---

## Regras críticas

1. **O renderer nunca importa `node:*` nem `electron`.** Todo I/O passa por `window.wttp.*`. Precisa de algo novo? Novo canal IPC — use a skill `wttp-ipc-channel`.
2. **Nenhuma cor crua em componente.** Só tokens semânticos (`bg-surface-2`, `text-muted`). Ver [docs/design-system.md](docs/design-system.md).
3. **O formato em disco é contrato público.** Qualquer mudança passa por [docs/file-format.md](docs/file-format.md) primeiro. Serialização é determinística — salvar sem alterar nada produz bytes idênticos.
4. **Segredos nunca em YAML.** Keychain do SO, com fallback em `.wttp/` (gitignored).
5. **Scripts de usuário rodam isolados** em `utilityProcess` + `node:vm` com timeout. Nunca no main, nunca no renderer.
6. **Docs em PT-BR, código e UI em inglês.**

---

## Referência

| Documento                                        | Conteúdo                                         |
| ------------------------------------------------ | ------------------------------------------------ |
| [docs/overview.md](docs/overview.md)             | visão do produto                                 |
| [docs/architecture.md](docs/architecture.md)     | processos, contrato IPC, fluxo de uma requisição |
| [docs/file-format.md](docs/file-format.md)       | especificação do YAML em disco                   |
| [docs/design-system.md](docs/design-system.md)   | paleta, tokens, tipografia, componentes base     |
| [docs/conventions.md](docs/conventions.md)       | código, estado, lint, testes, git                |
| [docs/backlog/README.md](docs/backlog/README.md) | épicos e tasks                                   |

## Skills

| Skill                | Quando                                                  |
| -------------------- | ------------------------------------------------------- |
| `wttp-task`          | executar uma task do backlog (`EP-XX-TYY`)              |
| `wttp-vue-component` | criar ou editar componente/página Vue                   |
| `wttp-ipc-channel`   | adicionar ou alterar comunicação main↔renderer          |
| `wttp-file-format`   | ler, gravar ou migrar arquivos de workspace             |
| `wttp-importer`      | adicionar importador (Postman, Insomnia, OpenAPI, cURL) |

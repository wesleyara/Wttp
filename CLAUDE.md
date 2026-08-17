# Wttp

Cliente HTTP local e open source — desenvolver, testar e documentar APIs. Desktop app (Electron + Vue 3), com workspaces, collections, environments e variáveis persistidos em **arquivos YAML versionáveis** na máquina do usuário.

Visão do produto: [docs/overview.md](docs/overview.md).

---

## Estado do projeto

**Pré-MVP.** A fundação (**EP-01**), o design system/shell (**EP-02**) e o núcleo HTTP
(**EP-03**) estão prontos: electron-vite com os três processos comunicando, IPC tipado,
tokens semânticos com dark mode, os componentes base `W*`, o shell de três painéis
(`WSplitPane`) com tamanhos persistidos, tema com `useSettingsStore`, menu nativo com
atalhos, a engine HTTP (`src/main/http`, todos os métodos e tipos de body, redirects,
timing, cancelamento), `WCodeEditor` (CodeMirror 6), e a UI de montar/disparar/inspecionar
uma request (`RequestUrlBar`, `RequestConfigTabs`, `ResponsePanel`) — tudo isso já dá
para usar de ponta a ponta, só falta persistir em disco (EP-04). A verificação visual do
EP-02 e de toda a UI nova do EP-03 (dois temas, resposta real de servidor, resposta de
20MB) ainda não foi feita numa janela real — este ambiente de desenvolvimento não tem
`xvfb`/`sudo` para abrir uma; pendente antes de considerar qualquer um dos dois épicos
fechado de fato. Ver nota no topo de [EP-02](docs/backlog/EP-02-design-system.md) e as
notas por task em [EP-03](docs/backlog/EP-03-nucleo-http.md). Environments, variáveis,
auth e scripts ainda são placeholders — chegam nos épicos correspondentes.

Trabalho corrente: [docs/backlog/README.md](docs/backlog/README.md) → épico **EP-04**.

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

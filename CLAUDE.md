# Wttp

Cliente HTTP local e open source — desenvolver, testar e documentar APIs. Desktop app (Electron + Vue 3), com workspaces, collections, environments e variáveis persistidos em **arquivos YAML versionáveis** na máquina do usuário.

Visão do produto: [docs/overview.md](docs/overview.md).

---

## Estado do projeto

**Pré-MVP.** A fundação está sendo criada pelo **EP-01**. O scaffold antigo não existe mais; a paleta e as famílias tipográficas que ele definia sobrevivem em [docs/design-system.md](docs/design-system.md), que é a fonte da verdade visual.

Trabalho corrente: [docs/backlog/README.md](docs/backlog/README.md) → épico **EP-01**.

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

| Documento | Conteúdo |
|---|---|
| [docs/overview.md](docs/overview.md) | visão do produto |
| [docs/architecture.md](docs/architecture.md) | processos, contrato IPC, fluxo de uma requisição |
| [docs/file-format.md](docs/file-format.md) | especificação do YAML em disco |
| [docs/design-system.md](docs/design-system.md) | paleta, tokens, tipografia, componentes base |
| [docs/conventions.md](docs/conventions.md) | código, estado, lint, testes, git |
| [docs/backlog/README.md](docs/backlog/README.md) | épicos e tasks |

## Skills

| Skill | Quando |
|---|---|
| `wttp-task` | executar uma task do backlog (`EP-XX-TYY`) |
| `wttp-vue-component` | criar ou editar componente/página Vue |
| `wttp-ipc-channel` | adicionar ou alterar comunicação main↔renderer |
| `wttp-file-format` | ler, gravar ou migrar arquivos de workspace |
| `wttp-importer` | adicionar importador (Postman, Insomnia, OpenAPI, cURL) |

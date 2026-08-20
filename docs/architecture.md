# Arquitetura

O Wttp é um aplicativo Electron construído com [electron-vite](https://electron-vite.org/), com renderer em Vue 3 + TypeScript.

---

## 1. Processos

```
┌─────────────────────────────────────────────────────────────┐
│  main  (Node.js)                                            │
│  ─ janelas, menus, diálogos nativos                         │
│  ─ http/      engine de requisições                         │
│  ─ storage/   leitura/escrita YAML, watcher                 │
│  ─ scripts/   spawn do runner                               │
│  ─ importers/ Postman, Insomnia, OpenAPI, cURL              │
│  ─ ipc/       registro de handlers (sem lógica)             │
└───────┬─────────────────────────────────┬───────────────────┘
        │ ipcMain.handle                  │ utilityProcess
        │                                 ▼
        │                    ┌──────────────────────────┐
        │                    │  script-runner           │
        │                    │  node:vm + timeout       │
        │                    │  sem ipc, sem fs, sem net│
        │                    └──────────────────────────┘
        │
┌───────▼─────────────────────────────────────────────────────┐
│  preload  (contextBridge)                                   │
│  expõe exatamente window.wttp.*  — nada além disso          │
└───────┬─────────────────────────────────────────────────────┘
        │
┌───────▼─────────────────────────────────────────────────────┐
│  renderer  (Vue 3 + Pinia)                                  │
│  ─ apenas UI e estado. Zero I/O.                            │
└─────────────────────────────────────────────────────────────┘
```

### Regra de ouro

> O renderer **nunca** importa `node:*` nem `electron`. Todo acesso a disco, rede ou SO passa por `window.wttp.*`.

Se um componente Vue precisa de algo que só o Node consegue fazer, a resposta é sempre um novo canal IPC — nunca uma exceção à regra. Ver a skill `wttp-ipc-channel`.

### Sandbox do preload

Desde o Electron 20 o preload roda em sandbox por padrão e perde o Node completo. O template do electron-vite define `sandbox: false` na `BrowserWindow` e usa `@electron-toolkit/preload`, permitindo que o preload agrupe dependências. Isso é aceitável porque **o preload não executa conteúdo remoto** — ele só faz `contextBridge.exposeInMainWorld` de uma superfície fechada. As garantias que realmente importam continuam ativas:

- `contextIsolation: true`
- `nodeIntegration: false`
- `webSecurity: true`
- nenhuma navegação para origem externa dentro da janela do app

---

## 2. Contrato IPC

Canais nomeados `dominio:acao`. Tipos em `src/shared/ipc.ts`, importados pelos três processos — é a única pasta compartilhada e **não pode conter runtime**, apenas `type`/`interface`/`const enum` de string.

| Canal               | Tipo    | Payload → Retorno                                  |
| ------------------- | ------- | -------------------------------------------------- |
| `app:ping`          | invoke  | `void` → `{ version, platform }`                   |
| `ui:getState`       | invoke  | `void` → `UiState`                                 |
| `ui:setState`       | invoke  | `Partial<UiState>` → `UiState`                     |
| `settings:get`      | invoke  | `void` → `AppSettings`                             |
| `settings:set`      | invoke  | `Partial<AppSettings>` → `AppSettings`             |
| `http:send`         | invoke  | `HttpRequestSpec` → `HttpResponseResult`           |
| `http:cancel`       | invoke  | `{ requestId }` → `void`                           |
| `http:progress`     | event ↓ | `{ requestId, phase, bytes }`                      |
| `workspace:open`    | invoke  | `{ path? }` → `WorkspaceTree`                      |
| `workspace:create`  | invoke  | `{ path, name }` → `WorkspaceTree`                 |
| `workspace:recent`  | invoke  | `void` → `RecentWorkspace[]`                       |
| `workspace:changed` | event ↓ | `WorkspaceChangedEvent` (`{ tree, changedPaths }`) |
| `workspace:setVariables` | invoke | `{ root, variables }` → `WorkspaceTree`        |
| `node:read`         | invoke  | `{ path }` → `RequestNode \| FolderNode`           |
| `node:write`        | invoke  | `{ path, node }` → `void`                          |
| `node:move`         | invoke  | `{ from, to, seq }` → `void`                       |
| `node:delete`       | invoke  | `{ path }` → `void`                                |
| `env:list`          | invoke  | `{ root }` → `EnvironmentListItem[]`               |
| `env:save`          | invoke  | `SaveEnvironmentPayload` → `EnvironmentListItem`   |
| `env:delete`        | invoke  | `{ root, path }` → `void`                          |
| `env:duplicate`     | invoke  | `{ root, path }` → `EnvironmentListItem`           |
| `variables:resolveText` | invoke | `{ text, scope }` → `ResolveTextResultPayload` |
| `variables:resolveRequest` | invoke | `{ request, scope }` → `ResolveRequestResultPayload` |
| `secret:get`        | invoke  | `{ key }` → `string \| null`                       |
| `secret:set`        | invoke  | `{ key, value }` → `void`                          |
| `secret:delete`     | invoke  | `{ key }` → `void`                                 |
| `secret:status`     | invoke  | `void` → `{ encrypted: boolean }`                  |
| `script:run`        | invoke  | `ScriptRunSpec` → `ScriptResult`                   |
| `import:detect`     | invoke  | `{ content, filename? }` → `ImportFormat \| null`  |
| `import:run`        | invoke  | `{ format, content, root, targetPath }` → `ImportReport` |
| `import:parseCurl`  | invoke  | `{ content }` → `ParsedCurlRequest \| null`        |
| `menu:action`       | event ↓ | `MenuAction`                                       |
| `update:getStatus`  | invoke  | `void` → `UpdateStatus`                            |
| `update:check`      | invoke  | `void` → `void`                                    |
| `update:install`    | invoke  | `void` → `void`                                    |
| `update:status`     | event ↓ | `UpdateStatus`                                     |

`event ↓` = emitido do main para o renderer.

`menu:action` (EP-02-T06) é o primeiro `event ↓` implementado — atalho do menu nativo
clicado → `webContents.send` → `window.wttp.menu.onAction(callback)` no preload. Como
não tem payload de invocação nem retorno, fica fora do `IpcContract` tipado por
`payload`/`result`; `MenuAction` é só um `type` em `@shared`.

### Formato de erro

Todo handler `invoke` resolve com sucesso ou rejeita com um erro serializável de forma uniforme. Nunca vaze um `Error` cru do Node através do IPC — a stack não sobrevive à serialização estruturada e o renderer perde o código do erro.

```ts
// src/shared/ipc.ts
export interface WttpError {
  code: WttpErrorCode; // "ENOENT" | "SCHEMA_INVALID" | "SCRIPT_TIMEOUT" | ...
  message: string; // legível pelo usuário, já em inglês
  detail?: string; // caminho de arquivo, linha do YAML, etc.
}
```

---

## 3. Camadas do main

```
src/main/
├── index.ts          bootstrap, janela, ciclo de vida do app
├── ipc/              um arquivo por domínio; só valida payload e delega
├── config/           JSON de config do app em userData — ui-state, settings
├── http/             engine de requisição, timing, cancelamento
├── storage/          parser + serializer YAML, watcher, resolução de caminhos
├── scripts/          spawn e protocolo do utility process
├── importers/        parse → normalize → emit, um módulo por formato
└── secrets/          keychain do SO
```

`ipc/` é deliberadamente fino: valida a entrada, chama a camada de domínio, mapeia o erro para `WttpError`. Nenhuma regra de negócio vive ali — é o que permite testar `http/`, `storage/` e `importers/` com Vitest puro, sem subir o Electron.

---

## 4. Fluxo de uma requisição

```
 renderer                    main                     runner
    │
    │ 1. usuário clica Send
    │
    │ 2. resolve {{vars}} do environment ativo
    │
    ├─ script:run (preRequest) ──────────────────────────▶
    │                                                    │ vm + timeout 5s
    ◀─────────────────────── { vars atualizadas, logs } ─┤
    │
    ├─ http:send ──────────────▶
    │                          │ 3. aplica auth (após vars)
    │                          │ 4. monta body, dispara, mede timing
    ◀── http:progress ─────────┤
    ◀── HttpResponseResult ────┤
    │
    ├─ script:run (tests) ───────────────────────────────▶
    │                                                    │ recebe res congelada
    ◀──────────────── { assertions, vars, logs } ────────┤
    │
    │ 5. renderiza resposta + resultados de teste
```

Pontos que a ordem torna obrigatórios:

- **Variáveis antes de auth.** O token pode vir de `{{access_token}}`, definido pelo pre-request script da chamada anterior.
- **Body montado no main.** `multipart` e `binary` precisam ler arquivos do disco; o renderer só carrega o caminho.
- **Resposta congelada nos tests.** O script recebe uma cópia imutável de `res`; ele não pode alterar o que a UI vai mostrar.
- **Cancelamento é do main.** O renderer envia `http:cancel` com o `requestId`; o `AbortController` vive no engine.

---

## 5. Modelo de execução dos scripts

Scripts de usuário (pre-request e tests) rodam num `utilityProcess` do Electron, separado do main, com `node:vm` e timeout.

**Por que não no main:** um `while(true)` numa collection importada de terceiros congelaria o app inteiro. Um processo separado é morto sem consequências.

**Por que não no renderer:** o renderer tem acesso ao `contextBridge`; um script malicioso alcançaria toda a API do app.

Garantias do runner:

- Sem `ipcRenderer`, sem `fs`, sem `net`, sem `require` — o contexto do `vm` é montado explicitamente.
- Timeout padrão de 5s, configurável por workspace; ao estourar, o processo é morto e a requisição falha com `SCRIPT_TIMEOUT`.
- Comunicação por `postMessage` estruturado, apenas dados.
- `node:vm` não é uma fronteira de segurança perfeita; o isolamento real vem do processo separado sem privilégios, não do `vm`.

API exposta ao script — ver `docs/file-format.md` para onde ela é gravada:

```js
wttp.setVar(name, value)   wttp.getVar(name)
req                        // request resolvida, mutável no preRequest
res                        // resposta congelada, só na fase de tests
test(name, fn)             expect(value)
console.log / warn / error // capturados no console de scripts
```

---
name: wttp-ipc-channel
description: Adiciona ou altera um canal IPC entre o main e o renderer do Wttp. Use sempre que o renderer precisar de algo que só o Node consegue fazer — ler arquivo, requisição HTTP, diálogo nativo, keychain — ou ao mexer em src/main/ipc, src/preload ou src/shared/ipc.ts. Cobre os quatro pontos de edição que precisam mudar juntos.
---

# Adicionar um canal IPC

O renderer **nunca** importa `node:*` nem `electron`. Toda capacidade nova é um canal novo. Um canal exige quatro edições — esquecer qualquer uma quebra o build ou o typecheck.

Contexto: [docs/architecture.md §2](../../../docs/architecture.md).

## 1. Tipo em `src/shared/ipc.ts`

Nome do canal no formato `dominio:acao`. Registre no `IpcContract`:

```ts
export interface IpcContract {
  // ...
  "env:save": { payload: Environment; result: void }
}
```

`src/shared` **não pode conter runtime** — só `type`, `interface` e constantes de string. Ela é compilada nos três bundles.

## 2. Handler em `src/main/ipc/`

Um arquivo por domínio. O handler é fino: valida a entrada, delega, mapeia o erro.

```ts
handle("env:save", async payload => {
  assertEnvironment(payload)      // valida — o renderer não é confiável
  await saveEnvironment(payload)  // delega para a camada de domínio
})
```

Regras:

- **Nenhuma regra de negócio aqui.** Ela vive em `http/`, `storage/`, `importers/` — que precisam continuar testáveis com Vitest, sem Electron.
- **Valide o payload.** Mesmo vindo do próprio renderer.
- **Nunca vaze um `Error` cru.** Converta para `WttpError` com `code`, `message` legível e `detail` opcional. A stack do Node não sobrevive à serialização e o renderer perde o código do erro.
- Caminhos de arquivo vindos do renderer são validados contra escape da raiz do workspace (`../`).

## 3. Exposição no preload

```ts
// src/preload/index.ts
contextBridge.exposeInMainWorld("wttp", {
  env: {
    save: (env: Environment) => invoke("env:save", env),
  },
})
```

E declare o tipo em `src/preload/index.d.ts`, senão o renderer não enxerga o método.

Exponha **apenas** o que o renderer precisa. Nunca `ipcRenderer` inteiro, nunca uma função genérica `invoke(channel, ...)` — isso anula a superfície fechada.

## 4. Consumo no renderer

O componente **não** chama `window.wttp.*`. A store chama:

```ts
// stores/environment.ts
async function save(env: Environment) {
  try {
    await window.wttp.env.save(env)
  } catch (e) {
    error.value = e as WttpError
  }
}
```

Um ponto por domínio para tratar erro e estado de carregamento.

## Eventos main → renderer

Para fluxo contínuo (`http:progress`, `workspace:changed`), exponha um subscribe que devolve a função de cancelamento:

```ts
onProgress: (cb: (p: HttpProgress) => void) => {
  const listener = (_: unknown, p: HttpProgress) => cb(p)
  ipcRenderer.on("http:progress", listener)
  return () => ipcRenderer.off("http:progress", listener)
}
```

O renderer **precisa** chamar essa função no `onUnmounted` — sem isso, vazam listeners a cada montagem.

## Checklist

- [ ] Canal no `IpcContract`, nomeado `dominio:acao`
- [ ] Handler valida o payload e não contém regra de negócio
- [ ] Erro convertido para `WttpError`
- [ ] Preload expõe o método específico e declara o tipo em `index.d.ts`
- [ ] Renderer consome pela store, não direto no componente
- [ ] Evento contínuo devolve unsubscribe, chamado no `onUnmounted`
- [ ] `yarn typecheck` acusa erro ao chamar o canal com payload errado

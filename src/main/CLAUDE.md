# `src/main`

Processo Node do Wttp. Único lugar do repositório com acesso a disco, rede e SO.
Referência completa: [docs/architecture.md](../../docs/architecture.md).

---

## Camadas

```
src/main/
├── index.ts       bootstrap, janela, ciclo de vida do app
├── ipc/           um arquivo por domínio; só valida payload e delega
├── config/        JSON de config do app — ui-state, settings (EP-02); nunca o workspace
├── http/          engine de requisição, timing, cancelamento (EP-03)
├── storage/       parser + serializer YAML, watcher, resolução de caminhos (EP-04)
├── scripts/       spawn e protocolo do utility process (EP-09)
├── importers/     parse → normalize → emit, um módulo por formato (EP-08)
└── secrets/       keychain do SO (EP-07)
```

`ipc/` e `config/` existem hoje — as demais chegam junto do épico que as introduz.

`config/` guarda preferências do app em `app.getPath("userData")` (tema, tamanhos de
painel) — nunca o workspace do usuário, que é `storage/` (EP-04). A leitura/escrita de
JSON (`jsonFile.ts`) recebe o diretório como parâmetro em vez de chamar `app.getPath`
internamente, para ficar testável sem subir o Electron; `appDataDir.ts` é o único ponto
que de fato chama `app.getPath`.

## `ipc/` é fino

Um handler valida a entrada e delega. Nenhuma regra de negócio nele — é o que mantém `http/`, `storage/` e `importers/` testáveis com Vitest puro, sem subir o Electron. Adicionar ou alterar um canal segue a skill `wttp-ipc-channel`, que cobre os quatro pontos de edição (tipo em `@shared`, handler aqui, exposição no preload, consumo na store do renderer).

`registerHandler` (`ipc/registry.ts`) já cuida da conversão de erro — quem escreve um handler novo lança `DomainError` (`ipc/errors.ts`) ou deixa a exceção subir; nunca serializa `WttpError` manualmente.

## Formato de erro

Nunca deixe um `Error` cru do Node atravessar o IPC — a stack não sobrevive à serialização estruturada e o renderer perde o `code`. Lance `DomainError(code, message, detail?)`; `registerHandler` empacota como `WttpError` antes do `ipcMain.handle` rejeitar.

Pegadinha real: `ipcRenderer.invoke` prefixa a mensagem do erro rejeitado com `Error invoking remote method 'canal': Error: <json>`. O desempacotamento do lado do preload (`src/preload/ipc.ts`) já lida com isso — não assuma que a mensagem chega como JSON puro se mexer nesse código.

## O que nunca vai para o renderer

- Qualquer coisa de `node:*` ou do próprio módulo `electron` — o renderer não importa nenhum dos dois.
- Segredos em texto — vêm do keychain do SO (`secrets/`), nunca do YAML.
- Um `Error` do Node sem passar por `WttpError`.

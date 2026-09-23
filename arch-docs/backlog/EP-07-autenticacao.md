# EP-07 — Autenticação

**Status:** Concluída · **Alvo:** v0.1 · **Depende de:** EP-06

Quase toda API real exige autenticação. Sem isto, o usuário monta o header `Authorization` à mão em cada request.

Referência: [file-format.md §4](../file-format.md)

---

### EP-07-T01 — Modelo e herança de auth

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-06-T01

**Objetivo.** Definir auth uma vez na collection e usar em todas as requests.

**Escopo.**

- `AuthConfig` em `@shared` como union por `type`: `none`, `inherit`, `bearer`, `basic`, `apikey`. Já existia em `src/shared/http.ts` desde a preparação de EP-06 — `RequestFile`/`FolderFile` (`src/shared/storage.ts`) já tinham o campo `auth?: AuthConfig`, e parser/serializer/validate/`fieldOrder` (`src/main/storage`) já sabiam ler, gravar (ordem de chave por variante) e validar as cinco variantes. Nada disso precisou mudar nesta task — só a resolução da herança faltava.
- Resolução da herança: `resolveAuthChain` (`src/main/http/authInheritance.ts`, puro) recebe a cadeia já montada por quem chama — `chain[0]` a auth da própria request, o resto a `folder.auth` de cada pasta subindo até a raiz da collection, pasta mais próxima primeiro — e devolve a primeira camada que não seja `inherit`. Um elo `undefined` (pasta sem `folder.yaml`, ou sem campo `auth`) se comporta como `inherit`. Exposto ao renderer via `variables:resolveAuthChain` (mesmo padrão de `variables:resolveRequest`); `useVariablesStore.authChain()`/`resolveEffectiveAuth()` montam a cadeia reaproveitando o `folderChain()` já usado por `collectionScope` (EP-06).
- `inherit` é o padrão de request nova (`data.auth ?? { type: "none" }` no build da aba trata ausência como `none`, mas o valor gravado por padrão em request nova é `inherit` — ver `node:create`/serializer).
- `none` corta explicitamente a herança — parar na primeira camada concreta, seja ela `none` ou um tipo configurado, é exatamente o que `resolveAuthChain` faz.

**Critérios de aceite.**

- [x] Herança resolvida corretamente com três níveis de pasta — `authInheritance.spec.ts`, caso "resolve com três níveis de pasta, pasta mais próxima vencendo"
- [x] `none` numa request ignora a auth da collection — `authInheritance.spec.ts`, caso "none na request corta a herança"
- [x] Nenhuma auth em lugar nenhum resulta em requisição sem header, sem erro — `authInheritance.spec.ts` resolve em `{ type: "none" }`; `applyAuth` (EP-07-T02) não adiciona header nenhum para esse tipo

---

### EP-07-T02 — Aplicação no engine

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-07-T01, EP-03-T02

**Objetivo.** A auth vira header ou query no momento certo.

**Escopo.**

- `applyAuth` (`src/main/http/auth.ts`, puro) roda no início de `sendHttpRequest` (`src/main/http/engine.ts`) — depois que `variables:resolveRequest` (EP-06) já substituiu qualquer `{{token}}` no `AuthConfig`, e depois que `useVariablesStore.resolveEffectiveAuth`/`requestTabs.effectiveAuthFor` já resolveram a herança (T01), então `spec.auth` chega aqui como um tipo concreto.
- `bearer` → header `Authorization: Bearer <token>` (omitido se o token resolver vazio); `basic` → `Authorization: Basic <base64(user:pass)>`, codificado com `Buffer.from(str, "utf-8")` — não `btoa`, que trataria a string como Latin-1 e corromperia acentos; `apikey` → header nomeado por `key` ou parâmetro de query, conforme `in`.
- Header `Authorization` definido à mão em `spec.headers` (habilitado) faz `applyAuth` não tocar em nada quando a auth configurada é `bearer`/`basic` — `apikey` não usa `Authorization`, então não é afetado por essa checagem.

**Critérios de aceite.**

- [x] Os três tipos cobertos por teste unitário (`auth.spec.ts`) — **não** verificados contra um servidor de teste de verdade: não há harness de servidor HTTP de integração no repo para EP-03 nem EP-07, e subir um neste ambiente sem rede/serviços está fora do que dá para automatizar aqui. Registrado como pendência, mesmo padrão da verificação visual pendente de EP-02/03/05/06.
- [x] `basic` codifica corretamente caracteres não-ASCII na senha — `auth.spec.ts`, caso "basic codifica corretamente senha não-ASCII (bytes UTF-8, não latin1)"
- [x] Header manual vence a configuração, com aviso na UI — `applyAuth` implementa a precedência; aviso visual entregue em EP-07-T03 (`AuthConfigEditor.vue`)
- [x] Credencial não aparece em log nem em mensagem de erro — `applyAuth`/`engine.ts` nunca logam `spec`; `mapError` (engine.ts) só usa `error.message`/`code` do Node, nunca headers

---

### EP-07-T03 — Aba Auth

**Status:** Concluída · **Tamanho:** M · **Depende de:** EP-07-T02, EP-02-T03

**Objetivo.** Configurar auth pela interface, em qualquer nível.

**Escopo.**

- `AuthConfigEditor.vue` — seletor de tipo (`inherit`/`none`/`bearer`/`basic`/`apikey`) e campos correspondentes, mesmo componente usado na Aba Auth da request (`RequestConfigTabs.vue`) e no editor de pasta/collection (`FolderAuthModal.vue`, novo — não existia nenhum editor de `folder.yaml` na UI antes desta task, então esta é a primeira forma de configurar variáveis/auth de uma pasta pela interface em vez de editar o YAML à mão; editar `variables`/`docs` de pasta continua fora do escopo de EP-07). Aberto pelo menu de contexto de uma pasta na árvore ("Edit auth").
- `{{variáveis}}` com destaque/tooltip/autocomplete em todos os campos de texto (token, username, password, key, value) via `useVariablePreview` — mesmo composable de headers/body (EP-06-T05/EP-06.1).
- Modo `inherit`: `useEffectiveAuth` (novo composable, `src/renderer/src/composables/useEffectiveAuth.ts`) resolve a herança via `useVariablesStore.resolveEffectiveAuth` (que por sua vez chama `variables:resolveAuthChain`, EP-07-T01) e mostra o nome da pasta/"This request"/"This folder" de onde a auth efetiva vem, mais os campos (mascarados) do tipo que será de fato aplicado — não só a palavra "inherit".
- Trocar de tipo preserva o que já foi preenchido nos outros — um rascunho por tipo (`Map`) vivo enquanto o componente existir, mesmo padrão já usado para o tipo de body em `RequestConfigTabs.vue`.
- Token/senha/valor de API key mascarados por padrão (`type="password"`), com botão de revelar por campo (nunca persistido, nunca revelado por padrão) — mesmo padrão de `WKeyValueTable`'s `withSecret`.
- Um `Authorization` manual habilitado nos headers da request mostra um aviso explícito na Aba Auth quando a auth configurada é `bearer`/`basic` (a que esse header sobrescreve — EP-07-T02).

**Critérios de aceite.**

- [x] `inherit` informa a origem efetiva, não só a palavra "inherit" — `variables.spec.ts`, casos de `resolveEffectiveAuth`; UI em `AuthConfigEditor.vue` (bloco `v-if="authType === 'inherit'"`)
- [x] Trocar o tipo preserva o que já foi preenchido nos outros tipos — `drafts` (`Map`) em `AuthConfigEditor.vue`, mesmo padrão de `bodyDrafts`
- [x] Campo mascarado tem botão revelar e não é copiado por acidente — `type="password"` mais botão "Reveal"/"Hide" por campo; não há seleção automática do valor ao focar, então nada é copiado sem uma ação explícita do usuário
- **Pendência:** verificação visual nos dois temas não foi feita (mesma limitação já registrada em EP-02/03/05/06 — sem `xvfb`/`sudo` neste ambiente para abrir uma janela Electron de verdade).

---

### EP-07-T04 — Indicador de auth na request

**Status:** Concluída · **Tamanho:** P · **Depende de:** EP-07-T03

**Objetivo.** Saber se a request está autenticada sem abrir a aba.

**Escopo.**

- `WTabs.vue` ganhou dois campos opcionais por aba — `badge?: string` (rótulo curto, ex. "Bearer", "Bearer ↑" quando herdado) e `warning?: boolean` (ícone de alerta) — usados pela aba "Auth" de `RequestConfigTabs.vue`: o badge mostra o tipo efetivo (já resolvida a herança via `useEffectiveAuth`) sem precisar clicar na aba.
- O mesmo `useEffectiveAuth` alimenta um `useVariablePreview` sobre os campos de texto da auth **efetiva** (não só a da própria request — uma `{{var}}` não resolvida numa pasta herdada precisa avisar tanto quanto uma da própria request), acendendo o ícone de aviso na aba antes de qualquer tentativa de envio.
- `requestTabs.send()`/`confirmSendUnresolved()` (EP-07-T01/T02) já resolvem a auth efetiva antes de chamar `variables:resolveRequest`, então o fluxo de confirmação "variável não resolvida" que EP-06-T05 já tinha (`unresolvedSendId`/`unresolvedSendNames`, modal em `AppShell.vue`) cobre auth herdada automaticamente — nenhuma UI nova precisou ser criada para o aviso "antes do envio" além do já existente.

**Critérios de aceite.**

- [x] O tipo efetivo é visível sem abrir a aba — badge em `WTabs`/`RequestConfigTabs.vue` (`authBadge`)
- [x] Auth com variável não resolvida é sinalizada antes do envio — ícone de aviso live na aba (`authUnresolved`) e o modal de confirmação de `requestTabs.ts` (reaproveitado de EP-06-T05) na hora de enviar
- **Pendência:** mesma verificação visual pendente de EP-07-T03.

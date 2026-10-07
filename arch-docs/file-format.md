# Formato de arquivo

O formato em disco é o contrato mais duradouro do Wttp: é o que o usuário versiona no Git, revisa em pull request e mantém por anos. Mudanças aqui são caras — por isso este documento vem antes do código que o implementa.

**Princípio:** um arquivo YAML por request, pastas espelhando a hierarquia de collections. Legível, editável à mão, com diff limpo.

---

## 1. Layout de diretórios

```
my-api/                        # raiz do workspace
├── wttp.yaml                  # manifesto do workspace
├── environments/
│   ├── dev.yaml
│   └── prod.yaml
├── flows/                     # cenários que encadeiam requests (card #180)
│   └── login-and-fetch.flow.yaml
├── attachments/               # imagens e vídeos referenciados pelo `docs` (versionados)
│   └── tela-de-login-1a2b3c4d.png
├── .wttp/                     # gitignored — estado local da máquina
│   ├── secrets.json           # fallback quando não há keychain
│   ├── ui-state.json          # abas, pastas expandidas, filtro JSONPath e ignorados do diff por request
│   ├── drafts.json            # rascunho de cada aba suja, não salvo (EP-08.1)
│   └── history/                # últimas 10 execuções por request, mascarado (EP-08.1)
├── auth/                      # uma pasta = uma collection ou subpasta
│   ├── folder.yaml
│   ├── login.req.yaml
│   └── refresh-token.req.yaml
└── users/
    ├── folder.yaml
    ├── list-users.req.yaml
    └── admin/                 # subpastas aninham livremente
        ├── folder.yaml
        └── delete-user.req.yaml
```

O Wttp cria um `.gitignore` no workspace contendo `.wttp/` ao inicializá-lo.

---

## 2. `wttp.yaml` — workspace

```yaml
wttp: 1
name: My API
description: Backend público da plataforma.
defaultEnvironment: dev
settings:
  timeout: 30000 # ms
  followRedirects: true
  maxRedirects: 10
  validateTls: true
  scriptTimeout: 5000 # ms
variables: # variáveis globais do workspace
  - { name: api_version, value: v2, enabled: true }
```

## 3. `folder.yaml` — pasta / collection

Opcional. Sem ele a pasta ainda funciona, usando o nome do diretório.

```yaml
wttp: 1
name: Auth
seq: 1
auth:
  type: none
variables: # variáveis de collection/pasta (EP-06) — nível "collection/pasta" da precedência
  - { name: scope, value: openid profile, enabled: true }
scripts: # rodam em volta dos scripts da request (EP-09) — pasta mais próxima primeiro no pre-request, ordem inversa nos tests
  preRequest: |
    wttp.setVar("run_started_at", Date.now());
  tests: |
    test("no server error", () => expect(res.status).toBeTruthy());
docs: |
  Endpoints de autenticação e renovação de sessão.
```

## 4. `*.req.yaml` — request

```yaml
wttp: 1
name: Login
seq: 1
method: POST
url: "{{base_url}}/auth/login"

pathParams: # segmentos `:nome` na URL (EP-06.1) — substituídos antes da resolução de `{{var}}`
  - { name: id, value: "{{user_id}}", enabled: true }

query:
  - { name: verbose, value: "true", enabled: true }
  - { name: debug, value: "1", enabled: false, description: "só em dev" }

headers:
  - { name: Content-Type, value: application/json, enabled: true }
  - { name: X-Request-Id, value: "{{$uuid}}", enabled: true }

auth:
  type: inherit # none | inherit | bearer | basic | apikey

body:
  type: json # none | json | urlencoded | raw | multipart | binary
  json: |
    {
      "email": "{{user_email}}",
      "password": "{{user_password}}"
    }

settings:
  timeout: 10000 # sobrescreve o workspace

scripts:
  preRequest: |
    wttp.setVar("ts", Date.now());
  tests: |
    test("status 200", () => expect(res.status).toBe(200));
    test("retorna token", () => expect(res.json.token).toBeTruthy());
    wttp.setVar("access_token", res.json.token);

docs: |
  Autentica o usuário e retorna um JWT válido por 1h.
```

### Variantes de `body`

```yaml
body: { type: none }

body:
  type: urlencoded
  urlencoded:
    - { name: grant_type, value: password, enabled: true }

body:
  type: multipart
  multipart:
    - { name: file, type: file, value: ./fixtures/avatar.png, enabled: true }
    - { name: title, type: text, value: Avatar, enabled: true }

body:
  type: raw
  contentType: text/xml
  raw: |
    <request><id>1</id></request>

body:
  type: binary
  binary: ./fixtures/payload.bin
```

Caminhos de arquivo são **relativos à raiz do workspace** — nunca absolutos, senão a collection quebra na máquina do colega.

### Variantes de `auth`

```yaml
auth: { type: inherit } # herda da pasta/collection
auth: { type: none } # corta a herança
auth: { type: bearer, bearer: { token: "{{access_token}}" } }
auth: { type: basic, basic: { username: "{{user}}", password: "{{pass}}" } }
auth: { type: apikey, apikey: { key: X-Api-Key, value: "{{api_key}}", in: header } } # in: header | query
```

## 5. `environments/*.yaml`

```yaml
wttp: 1
name: dev
variables:
  - { name: base_url, value: "https://api.dev.example.com", enabled: true }
  - { name: user_email, value: dev@example.com, enabled: true }
  - { name: api_key, value: "", enabled: true, secret: true }
```

Variável com `secret: true` **nunca** tem o valor gravado no YAML — o campo fica vazio e o valor real vive no keychain do SO, sob a chave `wttp:<workspaceId>:<env>:<name>`. Sem keychain disponível, o fallback é `.wttp/secrets.json`, que é gitignored.

O nome do arquivo acompanha o `name` (regra 6): `dev` → `environments/dev.yaml`. Renomear o environment na UI renomeia o arquivo e migra as chaves de segredo para o novo `<env>`; o environment ativo do workspace segue o arquivo.

---

## 6. Regras invioláveis

Estas regras existem porque o arquivo é versionado por humanos. Quebrar qualquer uma delas gera diffs falsos ou perda de dados.

1. **`wttp: 1` é a versão do schema.** Toda mudança incompatível incrementa e exige um migrador em `src/main/storage/migrations/`. Abrir um workspace de versão maior que a suportada é um erro claro, nunca uma tentativa de adivinhação.

2. **Serialização determinística.** Ordem de chaves fixa, definida em código — não a ordem de inserção do objeto. Abrir uma request e salvá-la sem alterar nada deve produzir **bytes idênticos**. Isto é coberto por teste de round-trip e é o que impede o Wttp de poluir o `git diff` do usuário.

   **Quebra de linha.** Arquivos criados pelo Wttp usam LF (`\n`). Ao regravar um arquivo que já existe, o Wttp mantém a quebra de linha que ele tem: se a primeira linha termina em CRLF (`\r\n`), o arquivo inteiro é gravado em CRLF. É o caso comum no Windows, onde o Git vem com `core.autocrlf=true` e entrega o working tree em CRLF — sem isso, o primeiro save trocaria todas as linhas do arquivo em disco. Duplicar um nó ou um environment herda a quebra de linha do original. O conteúdo lido é o mesmo nos dois casos: o parser normaliza CRLF, então valores de blocos literais (`|`) nunca carregam `\r`.

3. **`seq` manda na ordenação.** Nunca inferir ordem do nome do arquivo ou do `readdir`. Reordenar na UI reescreve os `seq` das linhas afetadas.

4. **`enabled: false` preserva a linha.** Desabilitar um header o mantém no arquivo. Apagar a linha é uma ação distinta, explícita.

5. **Segredos jamais em YAML.** Sem exceção, sem flag de conveniência.

6. **Nome do arquivo é derivado, `name` é a verdade.** `Login` → `login.req.yaml`. Renomear na UI renomeia o arquivo, mas o `name` dentro do YAML é sempre o rótulo autoritativo — inclusive quando o usuário renomeia o arquivo à mão e cria uma divergência.

7. **Campos desconhecidos são preservados.** Ao ler um arquivo com chaves que esta versão não entende, mantê-las e regravá-las. Isso permite que um usuário numa versão antiga não destrua os dados de um colega numa versão nova.

---

## 7. Validação

Todo arquivo é validado ao ser lido. Erro de schema não derruba o workspace inteiro: o nó problemático é marcado como inválido na árvore, com a mensagem e a linha, e os demais continuam utilizáveis.

```
users/list-users.req.yaml:7
  SCHEMA_INVALID — "method" deve ser um método HTTP válido (recebido: "GETT")
```

---

## 8. Variáveis dinâmicas

Além das variáveis de usuário, o resolvedor entende um conjunto fechado de geradores, prefixados com `$`:

| Variável            | Resultado           |
| ------------------- | ------------------- |
| `{{$uuid}}`         | UUID v4             |
| `{{$timestamp}}`    | epoch em segundos   |
| `{{$isoTimestamp}}` | ISO 8601            |
| `{{$randomInt}}`    | inteiro de 0 a 1000 |

**Precedência na resolução** (a primeira que definir o nome vence):

```
runtime (wttp.setVar) > environment > collection/pasta > workspace > dinâmicas
```

A resolução é recursiva — uma variável pode referenciar outra — com detecção de ciclo. Variável não resolvida **não** vira string vazia: ela é destacada na UI e a requisição é bloqueada até o usuário decidir.

O nível "collection/pasta" é o merge das `variables` de `folder.yaml` na cadeia de pastas da request até a raiz, pasta mais próxima da request vencendo sobre as mais distantes.

---

## 9. `attachments/` — anexos da documentação

Imagens e vídeos que o markdown de `docs` (request, pasta, collection) referencia. Moram **no workspace**, ao lado dos YAMLs, e são versionados com eles — ao contrário de `.wttp/`, nunca são gitignorados.

```md
![tela de login](attachments/tela-de-login-1a2b3c4d.png)
![demo do fluxo](attachments/demo-fluxo-9f8e7d6c.mp4)
```

- **Um diretório só, na raiz.** `attachments/` é reservado: nunca aparece como collection na árvore, e os arquivos ficam diretamente nele (sem subpastas). Todos os `docs` do workspace apontam para ele, então mover ou renomear uma request nunca quebra uma referência.
- **Nome gravado: `<slug>-<8 hex do sha256>.<ext>`.** O hash do conteúdo torna anexar o mesmo arquivo duas vezes idempotente (um arquivo, nenhum diff) e impede que dois arquivos diferentes com o mesmo nome se sobrescrevam. O slug vem do nome original (minúsculas, sem acento, `-` no lugar de qualquer coisa fora de `a-z0-9`).
- **Referência é um caminho relativo à raiz do workspace**, com `/`, escrito com a sintaxe de imagem do markdown. A extensão decide a renderização: `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg` viram `<img>`; `mp4` e `webm` viram `<video controls>`. Nenhum outro tipo é aceito.
- **Limite de 50 MB por arquivo.** Acima disso o Wttp recusa com uma mensagem que sugere Git LFS — vídeos grandes pesam no repositório de quem clona.
- **Só `attachments/` é servido à prévia.** O protocolo interno `wttp-attachment:` recusa qualquer outro caminho do workspace (YAMLs, `.wttp/secrets.json`) e `../`.
- **Export.** O HTML exportado embute as imagens como `data:` (arquivo único, abre offline) e os vídeos até 8 MB; acima disso o vídeo vira um aviso no lugar do player. O markdown exportado mantém os caminhos relativos — a pasta `attachments/` precisa acompanhar o arquivo.
- **Remover uma referência nunca apaga o arquivo.** O mesmo anexo pode ser citado por vários `docs`, a edição é desfazível e o git já guarda o arquivo. Limpar é uma ação à parte — "Clean unused attachments…" no menu "+" da árvore e na busca rápida — que lista o que nenhum `docs` menciona e manda para a lixeira do SO só o que o usuário confirma. "Mencionar" é qualquer ocorrência do texto `attachments/<arquivo>` (imagem, link, bloco de código), no `docs` salvo de todo o workspace e no das abas abertas, ainda que não salvas. Sem lixeira na máquina (ex. Linux sem `gio`), o arquivo é apagado de vez e a UI avisa. Quando uma referência sai de um `docs` salvo e o anexo fica sem uso, o app mostra um aviso com atalho para a limpeza; órfãos que já existiam ao abrir o workspace ficam em silêncio.
- **Não é schema novo.** Nenhum campo de YAML mudou, então `wttp: 1` continua valendo: um Wttp antigo mostra o texto `![...](attachments/...)` como está e preserva os arquivos.

---

## 10. `flows/*.flow.yaml` — flows

Um **flow** é um cenário que junta requests de **qualquer pasta** num grafo, com a passagem de dados entre elas **explícita**: um mapeamento pega um pedaço da resposta de um nó e o grava numa variável que os nós seguintes enxergam com `{{nome}}`, sem escrever script. Nós de controle decidem o caminho (condição), esperam (delay) ou repetem o nó anterior até algo acontecer (poll until). (O Collection Runner roda uma pasta em ordem de `seq`, com o encadeamento implícito via `wttp.setVar`.)

```yaml
wttp: 2
name: Create or recover
start: login
nodes:
  - { id: login, type: request, request: auth/login.req.yaml, x: 0, y: 0 }
  - { id: create, type: request, request: users/create.req.yaml, x: 280, y: 0 }
  - { id: created, type: condition, when: { source: status, op: eq, value: "201" }, x: 560, y: 0 }
  - { id: job, type: request, request: jobs/get.req.yaml, x: 840, y: 0 }
  - {
      id: wait,
      type: pollUntil,
      when: { source: body, path: job.state, op: eq, value: done },
      intervalMs: 1000,
      maxAttempts: 10,
      x: 1120,
      y: 0,
    }
  - { id: pause, type: delay, ms: 2000, x: 840, y: 140 }
  - { id: recover, type: request, request: users/get.req.yaml, x: 1120, y: 140 }
edges:
  - { from: login, to: create }
  - { from: create, to: created }
  - { from: created, to: job, when: true }
  - { from: created, to: pause, when: false }
  - { from: job, to: wait }
  - { from: pause, to: recover }
  - { from: wait, to: route }
  - { from: route, to: recover, output: 2 }
mappings:
  - { from: login.res.body.data.token, to: token }
  - { from: create.res.body.id, to: user_id }
maxSteps: 50
```

- **Versão própria: `wttp: 2`.** O flow tem a linha de versão dele, separada dos demais arquivos (que seguem em `wttp: 1`): nasceu depois e ganhou o formato de grafo sem que request, pasta ou environment precisassem mudar. Uma versão maior que a suportada é recusada com mensagem clara (regra 1).
- **Migração 1 → 2.** A v1 (card #57) era uma lista linear — `nodes` só de requests, sem `type`, e a ordem da lista era a ordem de execução. Ao ler, o migrador dá `type: request` a todo nó e cria uma aresta de cada nó para o seguinte: mesmos nós, mesmas requests, mesmas posições, mesmos mapeamentos, mesmo caminho, sem perda. Salvar grava o v2. Arquivo sem `wttp` vale como v1.
- **Um diretório só, na raiz.** `flows/` é reservado, como `environments/` e `attachments/`: nunca aparece como collection na árvore. Nome do arquivo derivado do `name` (`Create or recover` → `flows/create-or-recover.flow.yaml`, regra 6).
- **`nodes`**: cada nó tem `id` (obrigatório, único no flow, `[A-Za-z0-9_-]+` — é como as arestas e os mapeamentos o citam), `type` e `x`/`y` (números opcionais, a posição no canvas; ausentes valem 0). Tipos:
  - `request`: `request` é o caminho relativo à raiz do workspace, com `/`, de um `*.req.yaml` — **uma referência, nunca uma cópia**: editar a request vale para todo flow que a usa. A mesma request pode aparecer em mais de um nó, com `id`s diferentes.
  - `condition`: `when` (condição, abaixo). Tem duas saídas, `true` e `false`, e avalia a resposta do último nó de request executado.
  - `pollUntil`: `when`, `intervalMs` (mínimo 1000) e `maxAttempts` (1 a 1000, **obrigatório**: o poll nunca fica preso esperando). **Reexecuta o nó de request imediatamente anterior** (exatamente uma aresta chega nele, vinda de um `request`) até a condição bater; a primeira avaliação usa a resposta que já existe. No limite, o nó falha com uma mensagem.
  - `delay`: `ms` (0 a 600000), uma espera fixa.
  - `function`: `outputs` (1 a 10) e `code`, o **corpo de uma função JavaScript** que decide por qual saída o flow segue. Roda isolado (`utilityProcess` + `node:vm`, com o timeout dos scripts — regra crítica 5) e vê `res` (a resposta do último nó de request), `vars` (as variáveis de runtime do flow, que ele lê e escreve) e a API de scripts (`arch-docs/scripting.md`, "Nó de função"). `return N` segue a saída `N`, um array `[null, x]` segue a primeira posição que não é `null`, e não devolver nada termina o flow ali; uma saída inexistente ou um retorno de outro tipo **falha o nó**, e o flow para mesmo sem `bail`. O `code` é gravado em bloco literal (`|`), legível no diff, e o nó vai em formato de bloco em vez de `{ ... }` numa linha.
- **`edges`** liga a saída de um nó à entrada de outro. Cada nó tem **no máximo uma saída** (`from`/`to`); só a `condition` se divide em duas, com `when: true` e `when: false` (uma aresta sem `when` saindo de uma condição, ou com `when` saindo de outro nó, é inválida), e a `function` em até dez, numeradas com `output: 1..N` (obrigatório numa aresta que sai de uma função, entre 1 e o `outputs` dela; inválido em qualquer outro nó). Nó sem saída encerra o flow. `start` (opcional) é o nó inicial; ausente, o primeiro de `nodes`. Ciclos são permitidos (é como se faz um laço), por isso há um teto: `maxSteps` (1 a 1000, padrão 100) conta cada execução de nó, re-execuções de poll incluídas, e ao estourar o flow para com `endedEarly: limit` e uma mensagem.
- **Condição (`when`)** é estruturada — **nunca código**: `source` (`status`, `body`, `header` ou `assertions`), `path` (`body`: o caminho no JSON; `header`: o nome), `op` (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `exists`, `notExists`) e `value` (texto; número em `gt`/`gte`/`lt`/`lte`; ausente em `exists`/`notExists`). `assertions` não tem `op`/`value`: vale quando há ao menos uma asserção e todas passaram. É o mesmo avaliador do "poll until" do modo watch.
- **`mappings`** é opcional, aplicado na ordem, **depois** que o nó de origem recebe resposta (mesmo que as asserções dele falhem), a cada execução dele. Cada um tem `from` e `to`:
  - `from` é `<id do nó>.res.status`, `<id do nó>.res.headers.<Nome>` (sem diferenciar maiúsculas) ou `<id do nó>.res.body.<caminho>`, onde `<caminho>` é um acesso ao JSON do corpo: `data.token`, `items[0].id`, `["x-y"].z` (o mesmo JSONPath do filtro da resposta, sem o `$.` inicial). A origem precisa ser um nó `request`. O valor extraído vira texto: número/booleano pelo `String`, objeto/array pelo JSON. Caminho sem resultado, ou corpo que não é JSON, **falha o nó** com uma mensagem — nunca grava um valor vazio em silêncio. A exceção é o nó cuja saída vai para uma `condition` ou um `pollUntil`: a falha vira um aviso no resultado e é a condição que decide o caminho (assim "se criou segue por A, senão por B" funciona mesmo quando a resposta de erro não traz o campo mapeado).
  - `to` é o nome da variável (`[A-Za-z_][A-Za-z0-9_.-]*`). Ela vive na camada **runtime** do resolvedor (§8: vence environment, collection e workspace) e só durante o run; **nada é gravado em disco** por um flow.
- **Validação antes de rodar.** Um `request` que não existe (renomeada fora do app, removida) ou está inválida, ou um `pollUntil` sem um nó de request logo antes, é um erro claro que impede o run; o app também reescreve as referências quando a request (ou uma pasta acima dela) é renomeada ou movida pela árvore.
- Campos desconhecidos são preservados (regra 7).
- Não existem ainda: execução paralela de ramos (uma função escolhe **uma** saída), sub-flows e `wttp run` de flows na CLI.

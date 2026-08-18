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
├── .wttp/                     # gitignored — estado local da máquina
│   ├── secrets.json           # fallback quando não há keychain
│   ├── ui-state.json          # abas abertas, pastas expandidas na árvore
│   └── drafts.json            # rascunho de cada aba suja, não salvo (EP-08.1)
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

---

## 6. Regras invioláveis

Estas regras existem porque o arquivo é versionado por humanos. Quebrar qualquer uma delas gera diffs falsos ou perda de dados.

1. **`wttp: 1` é a versão do schema.** Toda mudança incompatível incrementa e exige um migrador em `src/main/storage/migrations/`. Abrir um workspace de versão maior que a suportada é um erro claro, nunca uma tentativa de adivinhação.

2. **Serialização determinística.** Ordem de chaves fixa, definida em código — não a ordem de inserção do objeto. Abrir uma request e salvá-la sem alterar nada deve produzir **bytes idênticos**. Isto é coberto por teste de round-trip e é o que impede o Wttp de poluir o `git diff` do usuário.

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

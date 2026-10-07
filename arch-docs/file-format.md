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

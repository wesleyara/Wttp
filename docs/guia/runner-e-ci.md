# Rodar collections: Runner e CI

Rodar uma collection ou pasta inteira de uma vez, na interface para você, e no terminal
para o CI. É o que transforma uma collection com scripts de teste numa suíte que roda a
cada pull request.

## Runner na interface

Clique com o botão direito numa collection ou pasta na árvore e escolha **Rodar…** (ou
digite "rodar" na busca rápida, `Ctrl+P`, para o workspace inteiro). A aba do Runner mostra:

- **O que rodar**: as requests da pasta na ordem da árvore. Desmarque as que não quer e
  reordene com ↑/↓ ou arrastando. Isso vale só para esta execução e não muda a árvore.
- **Environment**, **iterações** (a lista inteira roda N vezes) e **intervalo entre requests**.
- **Parar na primeira falha**: sem isso, uma request que falha não interrompe as seguintes.
- **Gravar mudanças de variáveis**: o que os scripts gravam com `wttp.setVar` e
  `wttp.setCollectionVar` vai para o disco no fim, como num envio normal. Desligado, as
  mudanças só passam de uma request para a outra durante o run.

As variáveis fluem entre as requests: o login grava o token com `wttp.setVar` e a próxima
request já usa `{{token}}`. **Parar** interrompe a request que está em andamento e não roda
mais nenhuma. No fim aparecem o total, quantas passaram e falharam e a duração; clique numa
request para ver as asserções e o erro.

Uma request **passa** quando recebe resposta, nenhum script dá erro e todas as asserções
passam. Um 404 ou 500 sem teste nenhum não é falha. Se quiser checar o status, escreva um
teste (`expect(res.status).toBe(200)`).

::: tip O Runner usa a versão salva
O Runner lê as requests do disco. Se alguma request selecionada tem alterações não salvas,
a aba avisa. Salve (`Ctrl+S`) antes para rodar o que está na tela.
:::

## No terminal: `wttp run`

O mesmo Runner, sem o app, para o CI ou para o terminal. Precisa de Node 20 ou mais novo:

```sh
npx wttp-cli run ./api-tests --env ci
```

`<caminho>` é o workspace ou uma pasta dentro dele (o `wttp.yaml` é procurado subindo a
partir dali).

| Opção                    | O que faz                                                          |
| ------------------------ | ------------------------------------------------------------------ |
| `-e, --env <nome>`       | environment, pelo nome ou pelo arquivo em `environments/`          |
| `-n, --iterations <n>`   | roda a lista inteira N vezes                                       |
| `--delay <ms>`           | espera entre uma request e a próxima                               |
| `--bail`                 | para na primeira request que falhar                                |
| `-r, --reporter <lista>` | `cli`, `json`, `junit`; separados por vírgula ou repetindo a opção |
| `-o, --out <arquivo>`    | onde gravar o json/junit (sem isso, vai para o stdout)             |
| `--var nome=valor`       | sobrescreve uma variável só neste run (pode repetir)               |
| `--persist`              | grava no disco o que os scripts mudaram (padrão: não grava)        |

**Código de saída:** `0` quando tudo passou, `1` quando alguma request falhou, `2` para
uso errado ou workspace/environment inválido. É o que faz o job do CI falhar.

## Segredos no CI

Uma variável `secret: true` não tem valor no YAML, e no CI não há keychain. Passe o valor
por variável de ambiente `WTTP_SECRET_<NOME>`: o nome em maiúsculas, e qualquer caractere
fora de A-Z e 0-9 vira `_`.

| Variável no environment | Variável de ambiente        |
| ----------------------- | --------------------------- |
| `apiKey`                | `WTTP_SECRET_APIKEY`        |
| `client-secret`         | `WTTP_SECRET_CLIENT_SECRET` |

Para não vazar segredo em log:

- **Guarde o valor no cofre do CI** (GitHub Secrets, variáveis mascaradas do GitLab, credentials
  do Jenkins) e só o repasse como variável de ambiente. Nunca o escreva no YAML nem use `--var`
  para ele: o `--var` fica no comando, e o comando aparece no log.
- **O `wttp run` mascara os segredos** que recebe: toda ocorrência do valor vira `****` no
  terminal e nos relatórios json/junit (URL enviada, mensagens de erro e de asserção,
  `console.log` dos scripts).
- **Um segredo que falta não quebra o run**: o `wttp run` avisa quais `WTTP_SECRET_*` estão
  vazias antes de começar, e as requests que dependem delas falham com o motivo no relatório.

## GitHub Actions

```yaml
name: API tests
on: [pull_request]

jobs:
  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: wesleyara/Wttp@v1
        with:
          path: api-tests
          env: ci
        env:
          WTTP_SECRET_APIKEY: ${{ secrets.API_KEY }}
      # Mostra cada teste no resumo do job, mesmo quando falha.
      - uses: mikepenz/action-junit-report@v5
        if: always()
        with:
          report_paths: wttp-report.xml
```

Entradas da action: `path` (obrigatória), `env`, `iterations`, `bail`, `vars` (um
`nome=valor` por linha), `junit` (padrão `wttp-report.xml`; vazio para não gerar) e `version`
(versão do `wttp-cli`).

## GitLab CI

```yaml
api-tests:
  image: node:22
  script:
    - npx --yes wttp-cli run api-tests --env ci --reporter cli,junit --out wttp-report.xml
  # WTTP_SECRET_APIKEY vem de Settings → CI/CD → Variables, marcada como "Masked".
  artifacts:
    when: always
    reports:
      junit: wttp-report.xml
```

## Jenkins

```groovy
pipeline {
  agent { docker { image 'node:22' } }
  stages {
    stage('API tests') {
      steps {
        withCredentials([string(credentialsId: 'api-key', variable: 'WTTP_SECRET_APIKEY')]) {
          sh 'npx --yes wttp-cli run api-tests --env ci --reporter cli,junit --out wttp-report.xml'
        }
      }
    }
  }
  post {
    always { junit 'wttp-report.xml' }
  }
}
```

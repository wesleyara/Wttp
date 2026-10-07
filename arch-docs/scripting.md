# API de scripting

Referência da API disponível nos scripts pre-request e de teste de uma request, pasta
ou collection (EP-09). Contexto de execução: [architecture.md §5](architecture.md).

Cada request pode ter dois scripts, gravados em `scripts.preRequest` e `scripts.tests`
no `*.req.yaml` ([file-format.md §4](file-format.md)); pastas e collections também
podem ter os dois, em `folder.yaml`, herdados por toda request abaixo (EP-09-T03).

Na UI (aba Scripts) a sub-aba do segundo script chama-se "Post-response" — roda depois
da resposta chegar, mesmo nome que Insomnia/Postman usam. O campo em disco e o valor de
`phase` continuam `tests`; só o rótulo mudou.

---

## Onde cada coisa está disponível

| Global    | `preRequest` |    `tests`    |  `function`   | Descrição                                                                                        |
| --------- | :----------: | :-----------: | :-----------: | ------------------------------------------------------------------------------------------------ |
| `wttp`    |      ✓       |       ✓       |       ✓       | `setVar`/`getVar` (environment ativo), `setCollectionVar`/`getCollectionVar` (collection)        |
| `req`     | ✓ (mutável)  |       —       |       —       | a request resolvida, antes de disparar                                                           |
| `res`     |      —       | ✓ (congelada) | ✓ (congelada) | a resposta recebida (na função: a do último nó de request, ou `undefined` se nenhum rodou ainda) |
| `vars`    |      —       |       —       |  ✓ (mutável)  | só na função: as variáveis de runtime do flow                                                    |
| `test`    |      —       |       ✓       |       ✓       | declara uma asserção                                                                             |
| `expect`  |      —       |       ✓       |       ✓       | matchers usados dentro de `test`                                                                 |
| `console` |      ✓       |       ✓       |       ✓       | `log`/`warn`/`error`, capturados e mostrados na aba Tests                                        |

A fase `function` é a do **nó de função de um flow** (card #59, `arch-docs/file-format.md` §10): o
código é o **corpo de uma função** — `return` escolhe por qual das `outputs` saídas o flow segue
(ver "Nó de função" abaixo). Roda no mesmo processo isolado e com o mesmo timeout dos demais.

Nada além disso está no escopo do script — sem `require`, `process`, `fetch` ou
qualquer outra API do Node/browser.

---

## `wttp.setVar(name, value)` / `wttp.getVar(name)`

Lê e grava uma variável do **environment ativo**. `value` é sempre convertido para
string. Diferente de uma variável de runtime, isso **grava o arquivo
`environments/<env>.yaml` no disco** assim que o script termina — não precisa salvar a
aba do Environment manualmente, e o valor sobrevive a fechar o workspace.

```js
wttp.setVar("access_token", res.json.token);
const token = wttp.getVar("access_token");
```

Duas regras de segurança:

- **Sem environment ativo, `setVar` falha** com uma mensagem clara ("No active
  environment…") em vez de gravar em qualquer lugar — escolha um no seletor da
  `StatusBar` antes de rodar o script.
- **Uma variável `secret: true` nunca é sobrescrita por um script.** `getVar` nela
  sempre devolve `""` (o script não consegue ler o segredo de volta) e `setVar` nela é
  silenciosamente ignorado na hora de persistir — o resto do que o script setou grava
  normalmente.

## `wttp.setCollectionVar(name, value)` / `wttp.getCollectionVar(name)`

Igual a `setVar`/`getVar`, mas na **collection da request** — a pasta na raiz do
workspace que contém a request (não a pasta mais próxima, se houver subpastas no meio).
Grava em `folder.yaml` imediatamente, mesma lógica de persistência.

```js
wttp.setCollectionVar("base_url", "https://staging.example.com");
```

Sem collection (request solta na raiz do workspace), `setCollectionVar` falha com uma
mensagem clara em vez de não fazer nada silenciosamente.

## `req` — mutável, só no pre-request

A request já com `{{variável}}` resolvida, prestes a ser enviada. Mudar qualquer campo
aqui muda o que de fato vai pela rede.

```js
req.headers.push({ name: "X-Request-Time", value: String(Date.now()), enabled: true });
req.url = req.url.replace("staging", "production");
```

## `res` — congelada, só nos tests

A resposta recebida. Qualquer tentativa de alterar um campo é ignorada silenciosamente
(o objeto é `Object.freeze`d) — o script nunca influencia o que a UI mostra.

```js
res.status; // number
res.statusText; // string
res.headers; // { [nome]: valor }
res.body; // string — corpo decodificado como texto
res.json; // corpo parseado como JSON, ou undefined se não for JSON válido
res.size; // { headersSent, bodySent, headersReceived, bodyReceived }
res.timing; // { dns, connect, tls, ttfb, download, total } em ms
```

## `test(name, fn)` / `expect(value)`

```js
test("status is 200", () => expect(res.status).toBe(200));
test("has a token", () => expect(res.json.token).toBeTruthy());
```

Uma exceção dentro de `fn` — inclusive de um `expect` que falhou — marca aquele `test`
como falho, com a mensagem do erro; não interrompe os `test`s seguintes nem falha a
request inteira.

Matchers disponíveis em `expect(actual)`:

| Matcher                         | Passa quando…                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `.toBe(expected)`               | `actual === expected` (`Object.is`)                                                              |
| `.toEqual(expected)`            | igualdade estrutural profunda                                                                    |
| `.toBeTruthy()`                 | `actual` é truthy                                                                                |
| `.toContain(item)`              | `actual` é string/array e contém `item`                                                          |
| `.toHaveProperty(path, value?)` | `actual` tem a propriedade em `path` (`"a.b.c"`); se `value` for passado, também compara o valor |
| `.toMatch(regexOuString)`       | `actual` é string e casa com o padrão                                                            |

## `console.log` / `.warn` / `.error`

Capturados por fase (`preRequest`/`tests`) e mostrados no console de scripts da aba
Tests (EP-09-T05) — nunca vão para o terminal do processo main.

```js
console.log("token recebido:", res.json.token);
```

## Erros não tratados

Uma exceção não capturada no `preRequest` **aborta o envio** da request — nada é
disparado. No `tests`, uma exceção fora de um `test(...)` marca a fase inteira como
falha (sem crashar o app); prefira sempre colocar as asserções dentro de `test(...)`
para isolar falhas umas das outras.

## Timeout

Cada fase (pre-request e tests, de cada nível da cadeia — request, pasta, collection)
roda com o timeout configurado em `wttp.yaml` → `settings.scriptTimeout` (default
5000ms). Estourar o timeout mata o processo do script e falha aquela fase com
`SCRIPT_TIMEOUT` — não trava a UI.

---

## Nó de função (flows)

Um nó `function` de um flow tem `outputs` (1 a 10 saídas) e `code`. O código roda como o **corpo de
uma função** — pode usar `return` — com `res` (a resposta do último nó de request, congelada, ou
`undefined`), `vars` (as variáveis de runtime do flow), `wttp`, `test`/`expect` e `console`.

```js
console.log("status", res.status);
vars.token = res.json.data.token; // vale como {{token}} nos nós seguintes
if (res.status === 201) return 1; // segue pela saída 1
return 2; // ...ou pela saída 2
```

O que o código devolve decide o caminho:

| Retorno                        | Efeito                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------- |
| um inteiro `N` (1 a `outputs`) | segue pela saída `N`                                                            |
| um array, ex. `[null, x]`      | estilo Node-RED: segue pela **primeira** posição que não é `null`/`undefined`   |
| nada, `null` ou `undefined`    | nenhuma saída — o flow termina ali, sem erro                                    |
| qualquer outra coisa           | o nó **falha** com uma mensagem ("returned string — return the output number…") |
| um número fora de 1..`outputs` | o nó **falha**: "chose output 7, but this node has 2 outputs"                   |

- `vars` é lido e escrito como texto (`String`); apagar uma chave (`delete vars.x`) a remove do runtime.
  É a mesma camada que os mapeamentos de um flow usam: vence environment, collection e workspace
  (`arch-docs/file-format.md` §8), vale só durante o run e nada é gravado em disco.
- `wttp.setVar` escreve no environment ativo **em memória** durante o run (um flow não persiste);
  `wttp.setCollectionVar` falha — o nó não pertence a uma collection.
- Exceção não tratada, erro de sintaxe e timeout falham o nó; o flow para ali mesmo sem `bail`, já
  que nenhuma saída foi escolhida. As variáveis escritas até o ponto da falha são mantidas.

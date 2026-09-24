# API de scripts

Referência do que está disponível nos scripts **pre-request** e **post-response** de uma
request, pasta ou collection. Para o passo a passo, veja [Scripts e testes](./scripts).

Na aba **Scripts**, o segundo script chama-se "Post-response" — roda depois que a
resposta chega.

---

## Onde cada coisa está disponível

| Global    | `preRequest` |    `tests`    | Descrição                                                                                 |
| --------- | :----------: | :-----------: | ----------------------------------------------------------------------------------------- |
| `wttp`    |      ✓       |       ✓       | `setVar`/`getVar` (environment ativo), `setCollectionVar`/`getCollectionVar` (collection) |
| `req`     | ✓ (mutável)  |       —       | a request resolvida, antes de disparar                                                    |
| `res`     |      —       | ✓ (congelada) | a resposta recebida                                                                       |
| `test`    |      —       |       ✓       | declara uma asserção                                                                      |
| `expect`  |      —       |       ✓       | matchers usados dentro de `test`                                                          |
| `console` |      ✓       |       ✓       | `log`/`warn`/`error`, capturados e mostrados na aba Tests                                 |

Nada além disso está no escopo do script — sem `require`, `process`, `fetch` ou
qualquer outra API do Node/browser.

---

## `wttp.setVar(name, value)` / `wttp.getVar(name)`

Lê e grava uma variável do **environment ativo**. `value` é sempre convertido para
string. Diferente de uma variável de runtime, isso **grava o arquivo
o arquivo do environment no disco** assim que o script termina — não precisa salvar a
aba do Environment manualmente, e o valor sobrevive a fechar o workspace.

```js
wttp.setVar("access_token", res.json.token);
const token = wttp.getVar("access_token");
```

Duas regras de segurança:

- **Sem environment ativo, `setVar` falha** com uma mensagem clara em vez de gravar em
  qualquer lugar — escolha um no seletor da barra de status antes de rodar o script.
- **Uma variável `secret: true` nunca é sobrescrita por um script.** `getVar` nela
  sempre devolve `""` (o script não consegue ler o segredo de volta) e `setVar` nela é
  silenciosamente ignorado na hora de persistir — o resto do que o script setou grava
  normalmente.

## `wttp.setCollectionVar(name, value)` / `wttp.getCollectionVar(name)`

Igual a `setVar`/`getVar`, mas na **collection da request** — a pasta na raiz do
workspace que contém a request (não a pasta mais próxima, se houver subpastas no meio).
Grava no arquivo da collection imediatamente, mesma lógica de persistência.

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

Capturados por fase (pre-request e post-response) e mostrados no console de scripts da
aba **Tests** da resposta.

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
roda com o timeout configurado em `wttp.yaml` → `settings.scriptTimeout` (padrão
5000 ms). Estourar o timeout interrompe o script e falha aquela fase com um erro de timeout — não
trava a interface.

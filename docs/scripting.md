# API de scripting

Referência da API disponível nos scripts pre-request e de teste de uma request, pasta
ou collection (EP-09). Contexto de execução: [architecture.md §5](architecture.md).

Cada request pode ter dois scripts, gravados em `scripts.preRequest` e `scripts.tests`
no `*.req.yaml` ([file-format.md §4](file-format.md)); pastas e collections também
podem ter os dois, em `folder.yaml`, herdados por toda request abaixo (EP-09-T03).

---

## Onde cada coisa está disponível

| Global   | `preRequest` | `tests` | Descrição                                              |
| -------- | :-----------: | :-----: | ------------------------------------------------------- |
| `wttp`   | ✓             | ✓       | `setVar`/`getVar` de variáveis de runtime                |
| `req`    | ✓ (mutável)   | —       | a request resolvida, antes de disparar                  |
| `res`    | —             | ✓ (congelada) | a resposta recebida                                |
| `test`   | —             | ✓       | declara uma asserção                                     |
| `expect` | —             | ✓       | matchers usados dentro de `test`                         |
| `console`| ✓             | ✓       | `log`/`warn`/`error`, capturados e mostrados na aba Tests |

Nada além disso está no escopo do script — sem `require`, `process`, `fetch` ou
qualquer outra API do Node/browser.

---

## `wttp.setVar(name, value)` / `wttp.getVar(name)`

Variáveis de runtime: o nível de maior precedência do resolvedor de `{{variável}}`
([file-format.md](file-format.md), EP-06-T01). `value` é sempre convertido para string.
Definidas num script, ficam disponíveis para os scripts e requests seguintes **na mesma
sessão do app** — não persistem no YAML nem sobrevivem a fechar o workspace.

```js
wttp.setVar("access_token", res.json.token);
const token = wttp.getVar("access_token");
```

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
res.status      // number
res.statusText  // string
res.headers     // { [nome]: valor }
res.body        // string — corpo decodificado como texto
res.json        // corpo parseado como JSON, ou undefined se não for JSON válido
res.size        // { headersSent, bodySent, headersReceived, bodyReceived }
res.timing      // { dns, connect, tls, ttfb, download, total } em ms
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

| Matcher                          | Passa quando…                                        |
| --------------------------------- | ----------------------------------------------------- |
| `.toBe(expected)`                 | `actual === expected` (`Object.is`)                    |
| `.toEqual(expected)`              | igualdade estrutural profunda                          |
| `.toBeTruthy()`                   | `actual` é truthy                                       |
| `.toContain(item)`                | `actual` é string/array e contém `item`                |
| `.toHaveProperty(path, value?)`   | `actual` tem a propriedade em `path` (`"a.b.c"`); se `value` for passado, também compara o valor |
| `.toMatch(regexOuString)`         | `actual` é string e casa com o padrão                   |

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

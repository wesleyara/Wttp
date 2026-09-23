# Scripts e testes

Cada request, pasta e collection tem dois scripts em JavaScript, na aba **Scripts**:

- **Pre-request** — roda antes do envio e pode alterar a request.
- **Post-response** (os `tests`) — roda depois que a resposta chega, com asserções.

Os scripts rodam **isolados**, num processo à parte com timeout (5 s por padrão,
configurável em `wttp.yaml`): sem `require`, sem `process`, sem acesso ao disco. Um erro
ou timeout num script nunca trava o app.

## Ordem de execução

O pre-request roda **de fora para dentro** (collection → pasta → request) e os tests
**de dentro para fora**. Uma exceção no pre-request aborta o envio, com mensagem clara.

## Um exemplo: login que guarda o token

```js
// Post-response da request "Login"
test("status is 200", () => expect(res.status).toBe(200));
wttp.setVar("token", res.json.token);
```

Com um **Bearer** `{{token}}` herdado da collection, a request seguinte já sai
autenticada. `wttp.setVar` grava no environment ativo, no disco, assim que o script
termina — e nunca sobrescreve uma variável **Secret**.

## O que existe no script

| Global    | Onde          | Para quê                                                                    |
| --------- | ------------- | --------------------------------------------------------------------------- |
| `wttp`    | os dois       | `setVar`/`getVar` (environment), `setCollectionVar`/`getCollectionVar`      |
| `req`     | pre-request   | a request resolvida, mutável                                                |
| `res`     | post-response | a resposta (somente leitura): `status`, `headers`, `body`, `json`, `timing` |
| `test`    | post-response | declara uma asserção                                                        |
| `expect`  | post-response | `toBe`, `toEqual`, `toBeTruthy`, `toContain`, `toHaveProperty`, `toMatch`   |
| `console` | os dois       | `log`/`warn`/`error`, mostrados na aba **Tests**                            |

O editor tem autocomplete da API inteira, snippets e sinaliza erro de sintaxe. Os
resultados aparecem na aba **Tests** da resposta, e a barra de status resume as falhas.

Referência completa: [API de scripts](./api-de-scripts).

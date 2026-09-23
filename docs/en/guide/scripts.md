# Scripts and tests

Every request, folder and collection has two JavaScript scripts, in the **Scripts** tab:

- **Pre-request** — runs before sending and can change the request.
- **Post-response** (the `tests`) — runs once the response arrives, with assertions.

Scripts run **isolated**, in a separate process with a timeout (5 s by default,
configurable in `wttp.yaml`): no `require`, no `process`, no disk access. A script error
or timeout never freezes the app.

## Execution order

Pre-request runs **outside in** (collection → folder → request) and tests run **inside
out**. An exception in a pre-request aborts the send, with a clear message.

## An example: login that stores the token

```js
// Post-response of the "Login" request
test("status is 200", () => expect(res.status).toBe(200));
wttp.setVar("token", res.json.token);
```

With a **Bearer** `{{token}}` inherited from the collection, the next request goes out
authenticated. `wttp.setVar` writes to the active environment, on disk, as soon as the
script finishes — and never overwrites a **Secret** variable.

## What's available in a script

| Global    | Where         | What for                                                                  |
| --------- | ------------- | ------------------------------------------------------------------------- |
| `wttp`    | both          | `setVar`/`getVar` (environment), `setCollectionVar`/`getCollectionVar`    |
| `req`     | pre-request   | the resolved request, mutable                                             |
| `res`     | post-response | the response (read-only): `status`, `headers`, `body`, `json`, `timing`   |
| `test`    | post-response | declares an assertion                                                     |
| `expect`  | post-response | `toBe`, `toEqual`, `toBeTruthy`, `toContain`, `toHaveProperty`, `toMatch` |
| `console` | both          | `log`/`warn`/`error`, shown in the **Tests** tab                          |

The editor has autocomplete for the whole API, snippets and flags syntax errors. Results
appear in the response's **Tests** tab, and the status bar summarizes failures.

Full reference: [Scripting API](./scripting-api).

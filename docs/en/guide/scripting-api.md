# Scripting API

Reference for what is available in the **pre-request** and **post-response** scripts of a
request, folder or collection. For a walkthrough, see [Scripts and tests](./scripts).

In the **Scripts** tab, the second script is called "Post-response" — it runs after the
response arrives.

---

## What is available where

| Global    | Pre-request | Post-response | Description                                                                                |
| --------- | :---------: | :-----------: | ------------------------------------------------------------------------------------------ |
| `wttp`    |      ✓      |       ✓       | `setVar`/`getVar` (active environment), `setCollectionVar`/`getCollectionVar` (collection) |
| `req`     | ✓ (mutable) |       —       | the resolved request, before it is sent                                                    |
| `res`     |      —      | ✓ (read-only) | the response received                                                                      |
| `test`    |      —      |       ✓       | declares an assertion                                                                      |
| `expect`  |      —      |       ✓       | matchers used inside `test`                                                                |
| `console` |      ✓      |       ✓       | `log`/`warn`/`error`, shown in the **Tests** tab                                           |

Nothing else is in scope — no `require`, `process`, `fetch` or any other Node/browser API.

---

## `wttp.setVar(name, value)` / `wttp.getVar(name)`

Reads and writes a variable of the **active environment**. `value` is always converted to a
string. Unlike a runtime variable, this **writes the environment file to disk** as soon as
the script finishes — you don't need to save the Environment tab by hand, and the value
survives closing the workspace.

```js
wttp.setVar("access_token", res.json.token);
const token = wttp.getVar("access_token");
```

Two safety rules:

- **With no active environment, `setVar` fails** with a clear message instead of writing
  anywhere — pick one in the status bar selector before running the script.
- **A `secret` variable is never overwritten by a script.** `getVar` on it always returns
  `""` (a script can't read a secret back) and `setVar` on it is silently ignored when
  persisting — everything else the script set is saved normally.

## `wttp.setCollectionVar(name, value)` / `wttp.getCollectionVar(name)`

Same as `setVar`/`getVar`, but on the **request's collection** — the folder at the root of
the workspace that contains the request (not the nearest folder, if there are subfolders in
between). It saves to the collection file right away, with the same persistence logic.

```js
wttp.setCollectionVar("base_url", "https://staging.example.com");
```

With no collection (a request loose at the workspace root), `setCollectionVar` fails with a
clear message instead of silently doing nothing.

## `req` — mutable, pre-request only

The request with `{{variables}}` already resolved, about to be sent. Changing any field
here changes what actually goes over the network.

```js
req.headers.push({ name: "X-Request-Time", value: String(Date.now()), enabled: true });
req.url = req.url.replace("staging", "production");
```

## `res` — read-only, post-response only

The response received. Any attempt to change a field is silently ignored (the object is
frozen) — a script never influences what the UI shows.

```js
res.status; // number
res.statusText; // string
res.headers; // { [name]: value }
res.body; // string — body decoded as text
res.json; // body parsed as JSON, or undefined if it isn't valid JSON
res.size; // { headersSent, bodySent, headersReceived, bodyReceived }
res.timing; // { dns, connect, tls, ttfb, download, total } in ms
```

## `test(name, fn)` / `expect(value)`

```js
test("status is 200", () => expect(res.status).toBe(200));
test("has a token", () => expect(res.json.token).toBeTruthy());
```

An exception inside `fn` — including a failed `expect` — marks that `test` as failed, with
the error message; it doesn't stop the following `test`s or fail the whole request.

Matchers available on `expect(actual)`:

| Matcher                         | Passes when…                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `.toBe(expected)`               | `actual === expected` (`Object.is`)                                                             |
| `.toEqual(expected)`            | deep structural equality                                                                        |
| `.toBeTruthy()`                 | `actual` is truthy                                                                              |
| `.toContain(item)`              | `actual` is a string/array and contains `item`                                                  |
| `.toHaveProperty(path, value?)` | `actual` has the property at `path` (`"a.b.c"`); if `value` is passed, the value must match too |
| `.toMatch(regexOrString)`       | `actual` is a string and matches the pattern                                                    |

## `console.log` / `.warn` / `.error`

Captured per phase (pre-request and post-response) and shown in the scripts console of the
response's **Tests** tab.

```js
console.log("token received:", res.json.token);
```

## Unhandled errors

An uncaught exception in the pre-request **aborts the send** — nothing is dispatched. In
post-response, an exception outside a `test(...)` marks the whole phase as failed (without
crashing the app); always put assertions inside `test(...)` to isolate failures from one
another.

## Timeout

Each phase (pre-request and post-response, at every level of the chain — request, folder,
collection) runs with the timeout set in `wttp.yaml` → `settings.scriptTimeout` (default
5000 ms). Exceeding it stops the script and fails that phase with a timeout error — the
interface never freezes.

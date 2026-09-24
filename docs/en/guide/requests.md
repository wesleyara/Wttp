# Build and send a request

1. In the tree's **+**, create a collection and, inside it, a **request**.
2. Pick the method, type the URL (`https://postman-echo.com/get` works with no setup) and
   click **Send** — or `Ctrl/Cmd+Enter`.
3. The response shows up in the panel beside it (or below — the status bar button toggles
   the position).
4. `Ctrl/Cmd+S` saves it as a `.req.yaml` file inside the collection.

## Request configuration

| Tab         | What it does                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Params**  | Query params (a table kept in sync with the URL) and _path params_ — `:name` in the URL becomes a field.                                               |
| **Headers** | Request headers. Toggle each row on or off without deleting it.                                                                                        |
| **Body**    | None, JSON, URL Encoded, Raw (text/XML/HTML, with a `Content-Type` of your choice), Multipart (with files) or Binary. `Content-Type` follows the type. |
| **Auth**    | Bearer, Basic, API Key, or inherit — see [Authentication](./authentication).                                                                           |
| **Scripts** | Pre-request and post-response — see [Scripts and tests](./scripts).                                                                                    |
| **Docs**    | Markdown documenting the request, saved in the same YAML.                                                                                              |

Folders and collections have their own configuration tabs (variables, auth, scripts and
docs) that apply to everything under them.

## The response

The response panel shows status, time and size, and has tabs:

- **Response** — syntax highlighting, **Pretty**/**Raw** views and a **Preview** for HTML,
  images and PDF. **Copy** copies the text; **Save** writes the original bytes to disk.
- **Headers** and **Cookies**.
- **History** — the last 10 runs of the request, stored on disk (secrets and the
  `Authorization` header are masked before saving). Click an entry to view it; clearing
  removes that request's history.
- **Tests** — assertion results and the scripts' console.

Following redirects, timeout and TLS validation are configurable per workspace
(`wttp.yaml`, `settings` block). A request in flight can be cancelled.

## Variables in a request

Write `{{name}}` in any field — URL, params, headers, body, auth. Resolved variables are
highlighted, with a value tooltip and autocomplete as you type two opening braces. If any is left
without a value, Wttp asks before sending. See [Environments and variables](./environments).

## Copy as cURL

Right-click the request's tab, or the request in the tree, and choose **Copy as cURL**. You
can also type "curl" in Quick Open (`Ctrl+P`). The command is ready to paste into a bash/zsh
terminal and sends the same request as **Send**: variables, path params and inherited auth
already resolved, unsaved edits included. Pre-request scripts don't run.

By default auth values and secret variables come out as `****`. To copy the real values, use
the separate **Copy as cURL (with secrets)** action. A `{{variable}}` with no value stays
literal in the command, and the notice tells you which one.

## JWT tool

The key icon in the status bar opens the JWT tool: **Decode** shows the header and payload
of any token (any algorithm, entirely local) and **Encode** signs an HS256 token with the
secret you provide.

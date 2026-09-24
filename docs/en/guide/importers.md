# Importers

Bring in what you already have — always into a **new collection**, never touching what
exists.

| Format                      | Source                                                  |
| --------------------------- | ------------------------------------------------------- |
| **Postman Collection v2.1** | exported `.json` (plus the Postman environment, if any) |
| **Insomnia v4**             | `.json`/`.yaml` export                                  |
| **OpenAPI 3.x**             | `.json`/`.yaml` — each operation becomes a request      |
| **cURL**                    | a pasted `curl …` command                               |

## How to import

- **With no workspace open**: on the landing screen, **Import** — the result is a **new
  workspace**.
- **With a workspace open**: **+ → Import** in the sidebar — the new collection goes into
  the root of the current workspace.

Paste the content or pick a file; the format is detected automatically. Before writing
anything, the app shows a **tree preview** and a **report** of what couldn't be converted
(a feature with no equivalent, say) — nothing disappears silently.

## Paste a cURL into the URL bar

For a single request you don't need the modal: paste a `curl …` command (the browser
DevTools' "Copy as cURL", say) straight into the URL bar. Method, URL, params, headers, body
and auth are filled in at once.

- **Empty request** (just created): the cURL fills that request.
- **Request with content**: it's left untouched, and the cURL goes into a **new request**
  next to it, opened in its own tab.
- **A command that can't be understood** (no URL, say): nothing is pasted and a notice
  appears.

In the first two cases the request has unsaved changes; `Ctrl+S` saves it.

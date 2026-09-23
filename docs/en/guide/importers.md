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

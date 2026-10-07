# Documenting your APIs

The documentation lives **in the same YAML as the request**, versioned with the code —
the opposite of a wiki that goes stale. You can document each request, each folder and
each collection, read everything as one document inside the app, and export it for people
who don't use Wttp.

## Writing

On a request, the **Docs** tab; on a folder or collection, the **Overview** tab. It's a
markdown editor with two tabs, **Editor** and **Preview**, and a button to expand the
preview to full screen.

- The toolbar covers bold, italic, underline, strikethrough, headings, lists, task lists
  and the **Insert** menu (quote, code, link, image, table, diagram and formula).
- Code blocks are syntax-highlighted, ` ```mermaid ` draws diagrams and formulas work with
  KaTeX — all bundled in the app, nothing is downloaded from the internet.
- The **⋯ (More tools)** menu gathers shortcuts: _Callouts_ (note, tip, warning, danger),
  date and time, status and priority emoji, templates (bug report, meeting minutes),
  letter case, extra blocks (collapsible block, highlight, key, divider) and copy
  markdown.
- **`{{variables}}` show up in the preview with the active environment's value.**
  **Secret** variables appear as `••••` and unresolved ones are highlighted as written.
- The text is saved as a readable literal block (`docs: |`), so `git diff` shows the
  markdown line by line.

## Images and videos

Attachments live in the **`attachments/`** folder at the workspace root and **go to Git**
along with the YAMLs — anyone who clones the repository sees the same images.

- **Paste or drag** an image into the editor to attach it and insert the reference.
- The **paperclip** in the toolbar opens the file picker (several files at once) — the way
  to attach **videos**, which paste and drag don't cover.
- Accepted types: `png`, `jpg`, `gif`, `webp`, `svg`, `mp4` and `webm`. **50 MB per file**
  limit; above that Wttp refuses and suggests [Git LFS](./versioning#attachments) — big
  videos weigh on everyone who clones.
- The file is saved as `name-1a2b3c4d.png` (the suffix comes from the content). Attaching
  the same file twice results in a single file, with no diff.
- In markdown the reference is `![description](attachments/name-1a2b3c4d.png)`. The
  extension decides: `mp4` and `webm` become a player with controls, everything else an
  image.

### Removing attachments

**Deleting the reference from the text doesn't delete the file.** The same attachment may
be in several `docs`, editing is undoable and Git already keeps the file. Cleaning up is a
separate action:

- The **paperclip in the status bar** (bottom right), **Clean unused attachments…** in the
  tree's **+** menu and in quick search (`Ctrl+P`) open the list of what no `docs` mentions
  anymore, with thumbnail and size. Everything comes checked; uncheck what you want to keep
  and confirm with **Move to trash**.
- Files go to the **system trash**, so you can restore them. On a machine without a trash,
  Wttp deletes them permanently and tells you right away.
- Any mention of `attachments/file` counts as "in use" — in an image, a link or a code
  block — in the saved `docs` of the whole workspace and also in open tabs, even unsaved.
- When a reference leaves a saved `docs` and the attachment ends up unused, a notice with a
  **Review** button appears. Attachments that were already unused when you opened the
  workspace don't trigger it. Wttp never deletes anything on its own.

## Reading the documentation

Right-click a folder or collection → **Read docs**. The tab that opens shows the
collection as a document: an **index** on the left and, next to it, the folder's
documentation followed by its requests.

- Every request appears with its **minimal signature** — method, URL and params — even
  without `docs`.
- Each one has an **example request** (cURL, fetch or axios, your pick) and the **last
  response** recorded in the history. If the request was never sent, the panel says so.
  **Refresh examples** re-reads the history.
- Reading doesn't touch your working tabs: they stay as they were.

## Exporting

In the reading tab, **Export HTML** and **Export Markdown**.

- **HTML:** a single file, no CDN, that opens offline — navigable index, search,
  light/dark theme and the cURL, fetch and axios examples for each request. Images are
  embedded; so are videos up to **8 MB**, and above that the player is replaced by a
  notice.
- **Markdown:** a `.md` file with the same content. Attachment references stay relative, so
  bring the `attachments/` folder along.

**What never leaves in an export:**

- variable values — they stay as `{{variable}}`, never the environment's value;
- literal authentication values and sensitive headers (`Authorization`, `Cookie`,
  `X-API-Key`, anything with `token`, `secret` or `password` in the name), which become
  `****`. A `{{variable}}` reference is preserved;
- executed responses — the export documents the request, not what it returned.

# First workspace

A workspace is just a folder of YAML files — no account, no cloud sync.

On first launch Wttp shows the landing screen:

- **Create workspace** — creates a new folder with a `wttp.yaml`. First set the
  **workspaces root folder** in **Preferences → Workspaces**; new workspaces live in
  `<root folder>/wttp/`.
- **Open workspace** — points to a folder that already has a `wttp.yaml` (a workspace
  cloned from Git, for instance). If the folder isn't a workspace yet, the app offers to
  initialize it.
- **Import** — turns a Postman, Insomnia or OpenAPI collection, or a cURL command, into a
  new workspace. See [Importers](./importers).

Recently opened workspaces show under **Recent**, and the ones inside the root folder
under **Workspaces**.

## The tree

The sidebar shows collections, folders and requests. The **+** button creates a
**collection**, **folder** or **request**, or **imports** something into the workspace.

- **Click** a request to open a _preview_ tab (italic title); **double-click** — in the
  tree or on the tab itself — to pin it.
- **Context menu** (right-click): new request/folder, settings, rename (`F2`), duplicate
  (`Ctrl/Cmd+D`), move or copy to…, reveal in file explorer and delete (`Delete`, goes to
  the system trash).
- **Drag and drop** reorders and moves; **Ctrl/Cmd+click** selects several items and
  drags the whole group.
- **Filter…** at the top filters the tree by name.
- **Quick open** (`Ctrl/Cmd+P`) finds any request by name, path or URL.

## Tabs and session

Every request opens in its own tab. Right-click a tab for **Close**, **Close others** or
**Close all**; drag to reorder. When you quit the app, your tabs come back exactly as
they were — including what you typed and didn't save (the tab reappears marked as
dirty).

## Example workspace

The repository ships `examples/postman-echo-demo/`, with two collections — **Basics**
(simple GET/POST) and **Auth flow** (Basic inherited from the collection, and a Login →
Bearer check that stores a token and authenticates the next request) — all against
`https://postman-echo.com`, no account or API key needed. Just **Open workspace** on that
folder.

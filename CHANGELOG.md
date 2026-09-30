# Changelog

All notable changes to Wttp are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). While Wttp is `0.x`, a minor version may
include breaking changes.

New entries are generated from [Conventional Commits](https://www.conventionalcommits.org/)
by `yarn release <version>`; versions up to 0.3.0 were written by hand from the commit history.

## [Unreleased]

## [0.3.2](https://github.com/wesleyara/Wttp/compare/v0.3.1...v0.3.2) - 2026-09-30

### Fixed

- Adjust environment ui

## [0.3.1](https://github.com/wesleyara/Wttp/compare/v0.3.0...v0.3.1) - 2026-09-26

### Fixed

- Keep a workspace file's line endings when saving it

### Documentation

- Point the online documentation links to wttp.vercel.app

## [0.3.0](https://github.com/wesleyara/Wttp/compare/v0.2.0...v0.3.0) - 2026-09-25

Git inside the app, and a set of tools for working with responses.

### Added

- **Git:** repository status in the status bar and on each tree item.
- **Git:** a Changes tab that shows a field-by-field diff of requests, folders and
  environments instead of raw YAML.
- **Git:** stage, commit and discard from the Changes tab.
- **Git:** switch and create branches from the status bar.
- **History:** compare two runs of the same request side by side.
- **Responses:** clickable JSON tree. Click a value to save it to a variable or turn it
  into a test assertion.
- **Requests:** watch mode that re-sends a request on an interval until a condition is met.
- **Requests:** generate code snippets for fetch, axios, Python (requests), Go and HTTPie.
- **Project:** this changelog, also published in the documentation site.

### Changed

- Send and Watch share a single button in the URL bar.
- Release builds target Linux and Windows. macOS builds are opt-in.

### Fixed

- Focus rings are drawn inside inputs so they are no longer clipped.
- Context menus stay inside the viewport.
- The tree context menu and modals close as expected.
- The send control stays inside a narrow URL bar.
- Tab bar spacing, and a quieter notice when the workspace is not a Git repository.

## [0.2.0](https://github.com/wesleyara/Wttp/compare/v0.1.0...v0.2.0) - 2026-09-24

Collection Runner and CLI, a Portuguese UI, and user documentation.

### Added

- **Runner:** run a whole collection or folder, or a hand-picked and reordered selection,
  with iterations, delay between requests, stop on first failure, and the option to
  persist variables at the end. Opens from "Run…" on a folder or collection.
- **CLI:** `wttp run` runs collections from the terminal with `cli`, `json` and `junit`
  reporters and exit codes for CI. Secrets come from `WTTP_SECRET_<NAME>` and are
  masked in all output. A GitHub Action is included.
- **HTTP:** HTTP/2 over TLS, negotiated with ALPN when the server offers it.
- **Language:** English and Brazilian Portuguese UI, selectable in Preferences → General
  (follows the system language by default).
- **Documentation:** user guide in English and Portuguese, published online and bundled
  in the app for offline use (Help → Documentation).
- **Requests:** copy a request as a cURL command.
- **Requests:** paste a cURL command into the URL bar without overwriting existing work.
- **Responses:** filter JSON responses with JSONPath.

### Changed

- Environments are edited in a tab instead of a modal.
- Response status, time and size share a row with the response tabs when there is room.
- Long values in key/value tables wrap instead of being truncated.

### Fixed

- The bundled documentation follows the app theme and searches in Portuguese.

## [0.1.0](https://github.com/wesleyara/Wttp/releases/tag/v0.1.0) - 2026-08-20

First release: a local, file-based HTTP client whose workspaces are plain YAML files
that can be kept in Git.

### Added

- **HTTP:** every method and body type (JSON, raw text, form URL-encoded, multipart,
  binary), redirects, timing breakdown, download progress and cancellation.
- **Authentication:** Bearer, Basic and API key (header or query), set on a request,
  folder or collection and inherited down the tree.
- **Workspaces:** stored as readable YAML with deterministic formatting, schema
  validation and versioned migrations. Writes are atomic, and edits made outside the
  app show up live.
- **Workspaces:** landing screen to open, create and reopen recent workspaces, a
  configurable default folder, and switching between workspaces.
- **Collections:** virtualized tree with create, rename, duplicate, delete, drag and
  drop, multi-select, and "Move to…"/"Copy to…".
- **Tabs:** multiple request tabs, pinned tabs, "Close others"/"Close all", and a
  session that survives restarts, including unsaved drafts.
- **Quick open:** command palette on `Ctrl+P`.
- **Environments and variables:** `{{variable}}` resolution across runtime,
  environment, collection/folder and workspace scopes, plus dynamic variables
  (`$uuid`, `$timestamp`, `$isoTimestamp`, `$randomInt`). Includes highlighting,
  tooltips and autocomplete, and a warning before sending with unresolved variables.
- **Requests:** path parameters (`:name`) kept separate from query parameters.
- **Secrets:** secret environment values live in the OS keychain, never in YAML.
- **Scripts:** pre-request and post-response JavaScript, run in an isolated process
  with a timeout. Includes `wttp.setVar`/`setCollectionVar`, `test`/`expect`
  assertions and a captured console. Scripts can be set on requests, folders and
  collections and run as a chain.
- **Importers:** Postman Collection v2.1 (with environments), Insomnia v4, OpenAPI 3.x
  and cURL, into a new workspace or the open one.
- **History:** the last 10 executions of each request, stored on disk, in a History tab.
- **Tools:** JWT decoder and HS256 encoder.
- **Interface:** light and dark themes, three-pane layout with persisted sizes, native
  menu with shortcuts, toast notifications and a Preferences dialog.
- **Distribution:** installers for Linux (AppImage, deb), Windows (NSIS) and macOS
  (dmg), auto-update from GitHub Releases, `.wttp.yaml` file association, and an
  example workspace.

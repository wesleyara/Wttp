# Contributing to Wttp

Thanks for considering contributing. This guide takes you from a fresh clone
to a merged pull request.

## Setup

Requirements: [Node.js](https://nodejs.org) 20+ and [Yarn](https://yarnpkg.com) (classic, v1).

```sh
git clone https://github.com/wesleyara/Wttp.git
cd Wttp
yarn
yarn dev
```

`yarn dev` starts Electron with hot module reload across the three processes
(main, preload, renderer) and the user documentation site (VitePress, port 5174) — in
dev, Preferences → About → "Open bundled docs" opens that live server, so editing a `.md`
under `docs/` refreshes the window. `yarn dev:app` starts Electron alone.

Other commands you'll use:

```sh
yarn lint        # ESLint
yarn typecheck   # main + renderer, separately
yarn test        # Vitest (main/http, main/storage, main/importers)
yarn test:coverage
yarn test:e2e    # Playwright, four critical user flows
yarn build       # bundle all three processes
```

## Finding something to work on

Work is tracked as tasks in [arch-docs/backlog/](arch-docs/backlog/README.md), grouped
into epics (`EP-01`, `EP-02`, ...). Each task has an ID like `EP-03-T02`, a
status (`Pendente` / `Em andamento` / `Concluída` / `Bloqueada` / `Cancelada`),
a size estimate, and its dependencies.

1. Open [arch-docs/backlog/README.md](arch-docs/backlog/README.md) and pick a task
   marked `Pendente` whose dependencies are already `Concluída`.
2. Open the epic file it belongs to and read the whole task: objective,
   scope, acceptance criteria, and — just as important — what's explicitly
   **out of scope**. That boundary exists so the task stays a reviewable
   size; work that belongs to a different task should go there instead.
3. If you're new to the project, prefer a task sized `P` (half a day or
   less) for your first PR.
4. Comment on the relevant issue (or open one referencing the task ID) to
   avoid duplicate work before you start.

## Before you write code

Read [arch-docs/conventions.md](arch-docs/conventions.md) — code style, project
structure, state management, testing and Git conventions in one short
document. A few rules that surprise newcomers:

- The renderer process never imports `node:*` or `electron` directly — all
  I/O goes through `window.wttp.*` (an IPC bridge). See
  [arch-docs/architecture.md](arch-docs/architecture.md).
- No raw colors in components — only semantic design tokens (`bg-surface-2`,
  `text-muted`). See [arch-docs/design-system.md](arch-docs/design-system.md).
- The on-disk YAML format is a public contract — see
  [arch-docs/file-format.md](arch-docs/file-format.md) before changing anything
  workspace files read or write.
- Engineering documentation under `arch-docs/` (including the backlog) is written in
  Portuguese; code, UI strings, commit messages and PR descriptions are in
  English.

## Making the change

- Branch per task: `feat/EP-03-T02-http-engine`.
- Keep the diff inside the task's scope. If you discover extra work that's
  genuinely needed, either mention it explicitly in your PR description (if
  small) or open it as a new task in the appropriate epic (if not) — never
  fold it in silently.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org)
  in English (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), with
  the task ID in the body: `Refs EP-03-T02`.
- `yarn lint` and `yarn typecheck` must pass before every commit — no
  "fix it later".

## Before opening a pull request

Definition of Done for any task ([full list](arch-docs/backlog/README.md)):

- [ ] `yarn lint` and `yarn typecheck` pass
- [ ] `yarn test` passes; new logic under `main/` has a test
- [ ] New UI is checked in both dark and light themes
- [ ] Affected documentation (`arch-docs/`, `docs/`, `CLAUDE.md`) is updated in the same commit
- [ ] Task status updated in the backlog (epic file and `arch-docs/backlog/README.md`)

Go through the task's acceptance criteria one by one and verify each for
real — run it, write a test for it, or inspect the generated file. Don't
check off what you haven't actually verified; a half-finished task marked
done is worse than one left pending.

## Opening the pull request

Use the PR template — it asks for the task ID, a summary of what changed,
and the same Definition of Done checklist above. CI runs lint, typecheck,
test and a build on Linux, macOS and Windows; all must pass before merge.

A maintainer will review, may ask for changes, and merges once everything's
green.

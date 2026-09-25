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

Work is tracked in [GitHub Issues](https://github.com/wesleyara/Wttp/issues).

1. Pick an open issue, or open one describing the bug or feature first.
2. Read the whole issue: what's asked, the acceptance criteria if any, and
   what's explicitly **out of scope**. Keep the change inside that boundary so
   it stays a reviewable size.
3. Comment on the issue before you start, to avoid duplicate work.

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
- Engineering documentation under `arch-docs/` is written in
  Portuguese; code, UI strings, commit messages and PR descriptions are in
  English.

## Making the change

- One branch per change, prefixed with its type: `feat/http2-engine`, `fix/tree-menu-close`.
- Keep the diff inside the issue's scope. If you discover extra work that's
  genuinely needed, either mention it explicitly in your PR description (if
  small) or open a new issue for it (if not) — never
  fold it in silently.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org)
  in English (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), with
  the issue in the body when there is one: `Refs #42`. The subject line ends up in the
  [changelog](CHANGELOG.md) (`feat:` → Added, `fix:` → Fixed, `refactor:` →
  Changed), so write it for users: "fix: history tab stale after send", not
  "fix: adjust history". `chore:`/`test:`/`ci:` never appear there.
- `yarn lint` and `yarn typecheck` must pass before every commit — no
  "fix it later".

## Before opening a pull request

Definition of Done for any change:

- [ ] `yarn lint` and `yarn typecheck` pass
- [ ] `yarn test` passes; new logic under `main/` has a test
- [ ] New UI is checked in both dark and light themes
- [ ] Affected documentation (`arch-docs/`, `docs/`, `CLAUDE.md`) is updated in the same commit

Go through the issue's acceptance criteria one by one and verify each for
real — run it, write a test for it, or inspect the generated file. Don't
check off what you haven't actually verified; a half-finished change marked
done is worse than one left pending.

## Opening the pull request

Use the PR template — it asks for the related issue, a summary of what changed,
and the same Definition of Done checklist above. CI runs lint, typecheck,
test and a build on Linux, macOS and Windows; all must pass before merge.

A maintainer will review, may ask for changes, and merges once everything's
green.

## Releases

Maintainers cut a version with `yarn release <patch|minor|major>`, which updates
[CHANGELOG.md](CHANGELOG.md) from the commits since the last tag, bumps the
version, and creates a `chore(release)` commit and tag. Pushing the tag builds
the installers into a draft GitHub Release. Details in
[arch-docs/release.md](arch-docs/release.md).

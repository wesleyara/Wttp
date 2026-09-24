# Versioning with Git

The workspace is a folder of text files — version it like any code. The on-disk format is
a public contract: readable, hand-editable, with clean diffs.

```
my-workspace/
├── wttp.yaml              # workspace manifest
├── environments/          # one file per environment
├── .wttp/                 # machine-local — outside Git
├── auth/
│   ├── folder.yaml        # folder/collection configuration
│   └── login.req.yaml     # one request = one file
└── users/…
```

## What goes in and what doesn't

- **Goes to Git:** `wttp.yaml`, `folder.yaml`, `*.req.yaml` and `environments/*.yaml`.
- **Never goes:** `.wttp/` — tab session, drafts, run history and the secrets fallback.
  Wttp creates a `.gitignore` with `.wttp/` when it initializes a workspace.
- **Secrets:** variables marked **Secret** live in the OS keychain, never in YAML. Whoever
  clones the repository fills in their own values.

## Predictable diffs

Serialization is deterministic: saving without changes produces **identical bytes**, and
a pull request diff shows only what really changed. Edited a file outside the app (in an
editor, on a `git pull`)? The app notices and refreshes the UI without getting confused
by its own saves.

## Git inside the app

If the workspace is in a git repository (at its root or in a subfolder, like an
`api-tests/` folder inside your API's repository), Wttp uses the `git` installed on your
machine, with the same config, credentials and hooks as your terminal.

- **Branch and changes:** the status bar shows the current branch and how many files changed
  since the last commit. In the tree, each changed request gets a letter: **M** modified,
  **U** new and not tracked yet, **A** new and staged, **D** deleted. A folder with changes
  inside gets a dot. The button next to the filter shows only what changed.
- **Changes tab** (`Ctrl+Shift+G`, or the "N changed" in the status bar): lists what changed,
  grouped by folder, and shows each request's diff **field by field**, as a request and not
  as YAML: "header `X-Api-Version` 1 → 2". **Compare with** picks another branch or tag,
  without switching branches.
- **Commit and discard:** in the same tab you stage by file, folder or everything, write the
  message and press `Ctrl+Enter`. Discarding brings a file back to the last commit and always
  asks first, telling you what will be deleted and which tabs have unsaved edits. A commit
  only takes workspace files; if something outside it is staged, Wttp asks you to commit from
  the terminal. `.wttp/` is never committed.
- **Branches:** click the branch name in the status bar to find, switch or create one. You can
  also bring a remote branch in as a local one. With an unsaved tab, switching is blocked
  until you save or discard it. If the workspace is a subfolder, Wttp warns that the switch
  applies to the whole repository. After switching, the tree and tabs show the new branch; a
  tab whose request doesn't exist there gets marked, without closing.
- **No repository:** click "Not a git repository" in the status bar to create one (`git init`,
  with `.wttp/` in `.gitignore`). Without `git` installed, none of this shows up and the rest
  of the app works the same.

Wttp never forces anything: no `--force`, no merge or rebase. If git refuses a switch because
of local changes, its message shows up as is, and the terminal is still the place to resolve
conflicts.

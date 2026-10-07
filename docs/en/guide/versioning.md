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
- **Attachments:** `attachments/` (the docs' images and videos) goes to Git too — see
  [Attachments](#attachments).
- **Never goes:** `.wttp/` — tab session, drafts, run history and the secrets fallback.
  Wttp creates a `.gitignore` with `.wttp/` when it initializes a workspace.
- **Secrets:** variables marked **Secret** live in the OS keychain, never in YAML. Whoever
  clones the repository fills in their own values.

## Attachments

The images and videos you attach to the documentation live in `attachments/`, at the
workspace root, and are ordinary repository files: commit them together with the YAML that
mentions them. The name includes part of the content hash, so the same file never shows up
twice and two different files never overwrite each other.

Large binary files — videos, mostly — weigh on everyone who clones the repository. Wttp
refuses files above **50 MB**; if your team attaches videos often, consider
[Git LFS](https://git-lfs.com) for `attachments/*.mp4`. To remove from disk what the
documentation no longer uses, see
[Removing attachments](./documenting-apis#removing-attachments).

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

### Pull and push

When the branch has an upstream, the status bar shows `↑2 ↓1` (commits to push and to pull). Wttp runs `git fetch` in the background when a workspace opens and every 5 minutes — adjust or turn it off in **Preferences → General**.

The branch popover has **Pull** and **Push**:

- **Pull** is always fast-forward only. If the branch diverged from the remote, Wttp changes nothing and shows the command to resolve it in the terminal. Tabs with unsaved changes block the pull.
- **Push** never uses `--force`. If the remote has commits you don't, the push is refused with a clear message. A branch that isn't published yet offers **Publish branch**.
- Credentials come only from your system's git credential helper or ssh-agent. Wttp never asks for, stores or logs them; if authentication fails, it explains how to set up the helper.

### Timeline and restoring a version

Right-click a request, folder or collection (or a request's tab) and choose **Timeline**; for an environment, the **Timeline** button is in the editor. The list shows the commits that touched that file — short hash, author, relative date and message — and follows renames, so renaming the request in the tree doesn't cut its history.

Clicking a commit shows its field-by-field diff, against the previous commit or against the file as it is now (**Current file**). **Restore this version** writes exactly that commit's content to the file, like any other edit: it shows up as modified in **Changes** and nothing is committed. If the request's tab has unsaved edits, Wttp asks first. A file that was never committed shows an empty state explaining it.

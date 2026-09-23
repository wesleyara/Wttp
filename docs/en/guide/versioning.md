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

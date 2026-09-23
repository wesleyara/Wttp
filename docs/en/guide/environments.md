# Environments and variables

An **environment** is a set of variables (`{{base_url}}`, `{{api_key}}`, …) that you
switch with one click in the status bar — dev, staging, production.

## Create and edit

In the status bar, **Manage** opens the environment editor in its own tab. There you
create, rename, duplicate and delete environments and edit each one's variables: name,
value, description and whether it's enabled.

- Pick the active environment in the status bar selector. The choice is remembered per
  workspace. An environment whose name contains `prod` gets a **PROD** badge.
- A variable marked **Secret** is **never written to YAML**: the value goes to the OS
  keychain (Keychain on macOS, Credential Vault on Windows, libsecret on Linux). With no
  keychain available, Wttp falls back to a file in `.wttp/` (outside Git) and warns you.

## Where a variable can live

Strongest to weakest, when the same name appears in more than one place:

1. **Runtime** — values set by scripts during execution.
2. The active **environment**.
3. **Folder / collection** — variables from `folder.yaml` (the one closest to the request
   wins).
4. **Workspace** — global variables from `wttp.yaml`.
5. **Dynamic** — generated on the spot: `{{$uuid}}`, `{{$timestamp}}`,
   `{{$isoTimestamp}}`, `{{$randomInt}}`.

A variable may reference another (`{{base_url}}/v1`); a cycle is detected and reported as
a clear error. Unresolved variables stay as `{{name}}` — and Wttp asks for confirmation
before sending.

## Path params

`:id` in a URL such as `https://api.example.com/users/:id` becomes a field in the
**Params** tab. Its value can be a `{{variable}}`.

<div align="center">

# Wttp

**An open source HTTP client for developing, testing and documenting APIs.**

Local-first · Git-friendly · Free forever

</div>

---

> **Status: pre-alpha.** Wttp is under active development and is not usable yet. Follow the [backlog](docs/backlog/README.md) to see where it stands.

## What is Wttp?

Wttp is a desktop app for working with HTTP APIs — in the spirit of Postman, Insomnia and Bruno, with two commitments:

- **Your data stays yours.** Workspaces, collections and environments are plain YAML files on your machine. No account, no cloud sync, no lock-in.
- **Built for Git.** One file per request, deterministic serialization, clean diffs. Review API changes in pull requests like any other code.

## Features

| | |
|---|---|
| **Requests** | Every HTTP method, headers, query params, JSON/form/multipart/binary bodies |
| **Collections** | Folder tree mirroring your files, drag & drop, tabs |
| **Environments** | Per-environment variables with `{{interpolation}}` and scoped precedence |
| **Auth** | Bearer, Basic and API Key, inheritable from folder or collection |
| **Scripts** | Pre-request and test scripts in a sandboxed JS runtime |
| **Import** | Postman v2.1, Insomnia v4, OpenAPI 3.x and cURL commands |
| **Docs** | Markdown documentation per request, exportable *(planned)* |

## Development

```sh
yarn          # install
yarn dev      # run in development
yarn test     # run tests
yarn lint     # lint
yarn build    # build all processes
```

Building installers: `yarn build:win`, `yarn build:mac`, `yarn build:linux`.

## Contributing

Contributions are welcome. Start with [docs/backlog/README.md](docs/backlog/README.md) to find something to work on, and read [docs/conventions.md](docs/conventions.md) before opening a pull request.

Documentation under `docs/` is written in Portuguese; code, UI strings and commit messages are in English.

## License

MIT

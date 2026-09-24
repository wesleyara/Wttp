# Running collections: Runner and CI

Run a whole collection or folder at once — in the app for you, and in the terminal for CI.
It's what turns a collection with test scripts into a suite that runs on every pull request.

## Runner in the app

Right-click a collection or folder in the tree and choose **Run…** (or type "run" in Quick
Open, `Ctrl+P`, for the whole workspace). The Runner tab has:

- **What to run** — the folder's requests in tree order. Uncheck the ones you don't want and
  reorder with ↑/↓ or by dragging. This applies to this run only and doesn't change the tree.
- **Environment**, **iterations** (the whole list runs N times) and **delay between requests**.
- **Stop on first failure** — without it, a failing request doesn't stop the ones after it.
- **Save variable changes** — what scripts set with `wttp.setVar` and `wttp.setCollectionVar`
  is written to disk at the end, like a regular send. Off: changes only flow from one request
  to the next during the run.

Variables flow between requests: the login stores the token with `wttp.setVar` and the next
request already uses `{{token}}`. **Stop** interrupts the request in flight and runs nothing
else. At the end you get the total, how many passed and failed and the duration; click a
request to see its assertions and error.

A request **passes** when it gets a response, no script errors and every assertion passes. A
404 or 500 with no tests isn't a failure. To check the status, write a test
(`expect(res.status).toBe(200)`).

::: tip The Runner uses the saved version
The Runner reads requests from disk. If a selected request has unsaved changes, the tab warns
you. Save (`Ctrl+S`) first to run what's on screen.
:::

## In the terminal: `wttp run`

The same Runner without the app, for CI or your terminal. Needs Node 20 or newer:

```sh
npx wttp-cli run ./api-tests --env ci
```

`<path>` is the workspace or a folder inside it (`wttp.yaml` is looked up from there upwards).

| Option                  | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `-e, --env <name>`      | environment, by name or by its file in `environments/`   |
| `-n, --iterations <n>`  | run the whole list N times                               |
| `--delay <ms>`          | wait between one request and the next                    |
| `--bail`                | stop at the first failing request                        |
| `-r, --reporter <list>` | `cli`, `json`, `junit` — comma-separated or repeated     |
| `-o, --out <file>`      | where the json/junit goes (without it, stdout)           |
| `--var name=value`      | override a variable for this run only (repeatable)       |
| `--persist`             | write what scripts changed back to disk (default: don't) |

**Exit code:** `0` when everything passed, `1` when any request failed, `2` for wrong usage or
an invalid workspace/environment — that's what fails the CI job.

## Secrets in CI

A `secret: true` variable has no value in the YAML, and CI has no keychain. Pass it through a
`WTTP_SECRET_<NAME>` environment variable: the name upper-cased, and anything outside A–Z and
0–9 becomes `_`.

| Environment variable in Wttp | Environment variable in CI  |
| ---------------------------- | --------------------------- |
| `apiKey`                     | `WTTP_SECRET_APIKEY`        |
| `client-secret`              | `WTTP_SECRET_CLIENT_SECRET` |

To keep secrets out of logs:

- **Store the value in the CI's vault** (GitHub Secrets, masked GitLab variables, Jenkins
  credentials) and only hand it over as an environment variable. Never put it in the YAML
  and never pass it with `--var`: the command line shows up in the log.
- **`wttp run` masks the secrets it receives**: every occurrence of the value becomes `****`
  in the terminal and in the json/junit reports (sent URL, error and assertion messages,
  scripts' `console.log`).
- **A missing secret doesn't crash the run**: `wttp run` lists the empty `WTTP_SECRET_*`
  variables before starting, and the requests that depend on them fail with the reason in
  the report.

## GitHub Actions

```yaml
name: API tests
on: [pull_request]

jobs:
  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: wesleyara/Wttp@v1
        with:
          path: api-tests
          env: ci
        env:
          WTTP_SECRET_APIKEY: ${{ secrets.API_KEY }}
      # Shows each test in the job summary, even when it fails.
      - uses: mikepenz/action-junit-report@v5
        if: always()
        with:
          report_paths: wttp-report.xml
```

Action inputs: `path` (required), `env`, `iterations`, `bail`, `vars` (one `name=value` per
line), `junit` (default `wttp-report.xml`; empty to skip it) and `version` (the `wttp-cli`
version).

## GitLab CI

```yaml
api-tests:
  image: node:22
  script:
    - npx --yes wttp-cli run api-tests --env ci --reporter cli,junit --out wttp-report.xml
  # WTTP_SECRET_APIKEY comes from Settings → CI/CD → Variables, marked "Masked".
  artifacts:
    when: always
    reports:
      junit: wttp-report.xml
```

## Jenkins

```groovy
pipeline {
  agent { docker { image 'node:22' } }
  stages {
    stage('API tests') {
      steps {
        withCredentials([string(credentialsId: 'api-key', variable: 'WTTP_SECRET_APIKEY')]) {
          sh 'npx --yes wttp-cli run api-tests --env ci --reporter cli,junit --out wttp-report.xml'
        }
      }
    }
  }
  post {
    always { junit 'wttp-report.xml' }
  }
}
```

/* eslint-disable @typescript-eslint/explicit-function-return-type -- script .mjs sem TypeScript; não há onde anotar o tipo de retorno. */
// `yarn release <patch|minor|major|x.y.z> [--dry-run]` (card #63): prepara uma versão nova
// localmente. Como escolher entre patch/minor/major: arch-docs/release.md.
//
// 1. confere working tree limpo e que a tag `v<versão>` ainda não existe;
// 2. gera a seção da versão com o git-cliff (commits desde a última tag, `cliff.toml`) e
//    insere logo abaixo de `## [Unreleased]` no CHANGELOG.md;
// 3. sobe `version` em package.json e cli/package.json (app e `wttp-cli` andam juntos);
// 4. commit `chore(release): v<versão>` + tag anotada `v<versão>`.
//
// Nada é empurrado: o script imprime o `git push` para quem estiver liberando rodar depois
// de revisar (e, se quiser, editar à mão) o changelog. Empurrar a tag dispara
// `.github/workflows/release.yml`. `--dry-run` só imprime a seção que seria gerada.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { insertRelease, resolveVersion } from "./changelog.mjs";

// Versão fixa: o formato de saída faz parte do CHANGELOG.md versionado.
const GIT_CLIFF = "git-cliff@2.14.2";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const input = args.find(arg => !arg.startsWith("--"));

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function git(...gitArgs) {
  return execFileSync("git", gitArgs, { cwd: root, encoding: "utf8" }).trim();
}

function bumpVersion(file, version) {
  const path = resolve(root, file);
  const text = readFileSync(path, "utf8");
  const next = text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
  if (next === text) fail(`could not find a "version" field in ${file}`);
  writeFileSync(path, next);
}

const USAGE = "usage: yarn release <patch|minor|major|x.y.z> [--dry-run]";
if (!input) fail(USAGE);
const current = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const version = resolveVersion(input, current);
if (!version)
  fail(`"${input}" is neither patch/minor/major nor a semver version (x.y.z). ${USAGE}`);
const tag = `v${version}`;
console.log(`release: ${current} → ${version}`);

if (git("tag", "--list", tag)) fail(`tag ${tag} already exists`);
if (!dryRun && git("status", "--porcelain"))
  fail("working tree is not clean; commit or stash first");

const section = execFileSync(
  "npx",
  ["--yes", GIT_CLIFF, "--config", "cliff.toml", "--unreleased", "--tag", tag, "--strip", "all"],
  {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    shell: process.platform === "win32",
  },
).trim();
if (!section.includes("\n- "))
  fail(`no user-facing commits since the last tag; nothing to release as ${tag}`);

if (dryRun) {
  console.log(section);
  process.exit(0);
}

const changelogPath = resolve(root, "CHANGELOG.md");
writeFileSync(changelogPath, insertRelease(readFileSync(changelogPath, "utf8"), section));
bumpVersion("package.json", version);
bumpVersion("cli/package.json", version);

git("add", "CHANGELOG.md", "package.json", "cli/package.json");
git("commit", "-m", `chore(release): ${tag}`);
git("tag", "-a", tag, "-m", tag);

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
console.log(`Created commit and tag ${tag}. Review CHANGELOG.md, then publish with:

  git push origin ${branch} ${tag}

To amend the changelog first: edit CHANGELOG.md, \`git commit --amend\`, then
\`git tag -f -a ${tag} -m ${tag}\` before pushing.`);

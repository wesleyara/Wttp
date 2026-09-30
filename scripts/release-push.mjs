/* eslint-disable @typescript-eslint/explicit-function-return-type -- script .mjs sem TypeScript; não há onde anotar o tipo de retorno. */
// `yarn release:push [--dry-run]`: publica a versão criada por `yarn release` — envia a
// `develop` e a tag e avança a `main` por fast-forward (sem merge commit, para a tag ficar
// na ponta dela). Empurrar a tag dispara `.github/workflows/release.yml`.
// Fluxo: arch-docs/release.md.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");

function fail(message) {
  console.error(`release:push: ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function isAncestor(ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const tag = `v${version}`;

if (git("rev-parse", "--abbrev-ref", "HEAD") !== "develop")
  fail("run this from the develop branch");
if (git("status", "--porcelain")) fail("working tree is not clean");
if (git("log", "-1", "--format=%s") !== `chore(release): ${tag}`)
  fail(`HEAD is not the "chore(release): ${tag}" commit; run \`yarn release\` first`);
if (git("rev-parse", `${tag}^{commit}`) !== git("rev-parse", "HEAD"))
  fail(`tag ${tag} does not point at HEAD`);

git("fetch", "origin", "main", "develop");
if (git("ls-remote", "--tags", "origin", `refs/tags/${tag}`))
  fail(`tag ${tag} is already on origin`);
if (!isAncestor("origin/develop", "HEAD"))
  fail("origin/develop has commits that are not in local develop; pull first");
if (!isAncestor("origin/main", "HEAD"))
  fail("main cannot fast-forward to develop (origin/main has diverged); nothing was pushed");

if (dryRun) {
  console.log(`Would push develop and ${tag}, then fast-forward origin/main to ${tag}.`);
  process.exit(0);
}

git("push", "origin", "develop", tag);
git("push", "origin", "develop:main");
console.log(`Pushed develop and ${tag}; origin/main fast-forwarded. Follow Actions → Release.`);

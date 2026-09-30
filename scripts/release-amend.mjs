/* eslint-disable @typescript-eslint/explicit-function-return-type -- script .mjs sem TypeScript; não há onde anotar o tipo de retorno. */
// `yarn release:amend`: depois de editar o CHANGELOG.md à mão, funde a edição no commit
// `chore(release): v<versão>` criado por `yarn release` e move a tag para ele. Só vale
// antes do push — reescrever um commit já publicado não é seguro. Fluxo: arch-docs/release.md.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function fail(message) {
  console.error(`release:amend: ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const tag = `v${version}`;

if (git("log", "-1", "--format=%s") !== `chore(release): ${tag}`)
  fail(`HEAD is not the "chore(release): ${tag}" commit; run \`yarn release\` first`);
if (!git("tag", "--list", tag)) fail(`tag ${tag} does not exist`);
if (git("branch", "-r", "--contains", "HEAD"))
  fail("the release commit is already on a remote branch; do not rewrite published history");

const dirty = git("status", "--porcelain")
  .split("\n")
  .filter(line => line && !line.endsWith("CHANGELOG.md"));
if (dirty.length > 0) fail(`only CHANGELOG.md may be modified, found:\n${dirty.join("\n")}`);
if (!git("status", "--porcelain", "--", "CHANGELOG.md")) fail("CHANGELOG.md has no changes");

git("add", "CHANGELOG.md");
git("commit", "--amend", "--no-edit");
git("tag", "-f", "-a", tag, "-m", tag);
console.log(
  `Amended the release commit and moved tag ${tag} to it. Publish with: yarn release:push`,
);

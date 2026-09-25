/* eslint-disable @typescript-eslint/explicit-function-return-type -- script .mjs sem TypeScript; não há onde anotar o tipo de retorno. */
// Manipulação do CHANGELOG.md (card #63). O arquivo versionado é a fonte da verdade das
// notas de versão: `yarn release` insere a seção nova gerada pelo git-cliff logo abaixo de
// `## [Unreleased]`, e o workflow de release (e quem publica releases antigos à mão) lê
// de volta a seção de uma versão para usar como corpo do GitHub Release.
//
// Uso direto: `node scripts/changelog.mjs section <versão>` imprime a seção (sem o título).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const UNRELEASED_HEADING = "## [Unreleased]";

const VERSION_HEADING = /^## \[([^\]]+)\]/;

/** Versão sem o `v` na frente — tags são `v1.2.3`, títulos do changelog são `[1.2.3]`. */
export function normalizeVersion(version) {
  return version.trim().replace(/^v/, "");
}

/**
 * Corpo da seção de uma versão (tudo entre o título dela e o título seguinte), sem o
 * título. `null` quando a versão não existe no changelog.
 */
export function extractSection(markdown, version) {
  const wanted = normalizeVersion(version);
  const lines = markdown.split("\n");
  const start = lines.findIndex(line => VERSION_HEADING.exec(line)?.[1] === wanted);
  if (start === -1) return null;
  let end = lines.findIndex((line, i) => i > start && VERSION_HEADING.test(line));
  if (end === -1) end = lines.length;
  return lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
}

/**
 * Insere `section` (título `## [x.y.z]...` incluso, como o git-cliff gera) logo depois de
 * `## [Unreleased]`, descartando o que estava sob Unreleased — o conteúdo da versão nova
 * vem inteiro dos commits. Falha se a versão já existe ou se não há `## [Unreleased]`.
 */
export function insertRelease(markdown, section) {
  const heading = section.trim().split("\n")[0];
  const version = VERSION_HEADING.exec(heading)?.[1];
  if (!version) throw new Error(`Generated section has no version heading: "${heading}"`);
  if (extractSection(markdown, version) !== null) {
    throw new Error(`CHANGELOG.md already has a section for ${version}`);
  }
  const lines = markdown.split("\n");
  const unreleased = lines.indexOf(UNRELEASED_HEADING);
  if (unreleased === -1) throw new Error(`CHANGELOG.md has no "${UNRELEASED_HEADING}" heading`);
  let next = lines.findIndex((line, i) => i > unreleased && VERSION_HEADING.test(line));
  if (next === -1) next = lines.length;
  const before = lines.slice(0, unreleased + 1).join("\n");
  const after = lines.slice(next).join("\n");
  return `${before}\n\n${section.trim()}\n${after ? `\n${after}` : ""}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, version] = process.argv.slice(2);
  if (command !== "section" || !version) {
    console.error("usage: node scripts/changelog.mjs section <version>");
    process.exit(2);
  }
  const path = resolve(import.meta.dirname, "..", "CHANGELOG.md");
  const body = extractSection(readFileSync(path, "utf8"), version);
  if (body === null) {
    console.error(`CHANGELOG.md has no section for ${normalizeVersion(version)}`);
    process.exit(1);
  }
  process.stdout.write(`${body}\n`);
}

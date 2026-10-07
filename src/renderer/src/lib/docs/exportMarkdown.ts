/**
 * Export da documentação em markdown (EP-12-T03). Mesma fonte do HTML e do painel de
 * leitura (`model.ts`), então as mesmas regras de segredo valem aqui: `{{variáveis}}`
 * ficam como referência, valores literais de auth/headers sensíveis saem mascarados e
 * nenhuma resposta executada entra no arquivo.
 */

import type { CodegenLanguage } from "@renderer/lib/codegen";
import type { KeyValueEntry } from "@shared";

import {
  describeBody,
  DOCS_SNIPPET_LABELS,
  DOCS_SNIPPET_LANGUAGES,
  type DocsFolder,
  type DocsItem,
  type DocsRequest,
  enabledEntries,
  flattenDocs,
  redactAuth,
  redactHeaders,
  requestSnippet,
} from "./model";

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function table(title: string, entries: KeyValueEntry[]): string[] {
  if (entries.length === 0) return [];
  const withDescription = entries.some(entry => entry.description?.trim());
  return [
    `**${title}**`,
    "",
    withDescription ? "| Name | Value | Description |" : "| Name | Value |",
    withDescription ? "| --- | --- | --- |" : "| --- | --- |",
    ...entries.map(
      entry =>
        `| \`${cell(entry.name)}\` | \`${cell(entry.value)}\`${
          withDescription ? ` | ${cell(entry.description ?? "")}` : ""
        } |`,
    ),
    "",
  ];
}

function fence(code: string, language: string): string[] {
  // Fence mais longa que qualquer sequência de crases dentro do snippet.
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map(run => run.length));
  const marks = "`".repeat(longest + 1);
  return [`${marks}${language}`, code, marks, ""];
}

function snippetFence(language: CodegenLanguage): string {
  return language === "curl" ? "sh" : language === "python" ? "python" : "js";
}

/** Auth efetiva (própria ou herdada), já mascarada; `null` quando não há auth. */
export function describeAuth(request: DocsRequest): string | null {
  const auth = redactAuth(request.effectiveAuth);
  const origin = request.authInherited ? " — inherited from the parent folder or collection" : "";
  switch (auth.type) {
    case "bearer":
      return `Bearer token (\`${auth.bearer.token}\`)${origin}`;
    case "basic":
      return `Basic (user \`${auth.basic.username}\`, password \`${auth.basic.password}\`)${origin}`;
    case "apikey":
      return `API key \`${auth.apikey.key}\` in ${auth.apikey.in} (\`${auth.apikey.value}\`)${origin}`;
    default:
      return null;
  }
}

function requestSection(request: DocsRequest, level: number): string[] {
  const lines = [
    `${"#".repeat(level)} ${request.name}`,
    "",
    `\`${request.method} ${request.url}\``,
    "",
  ];
  if (request.docs.trim()) lines.push(request.docs.trimEnd(), "");
  lines.push(...table("Path params", enabledEntries(request.pathParams)));
  lines.push(...table("Query params", enabledEntries(request.query)));
  lines.push(...table("Headers", enabledEntries(redactHeaders(request.headers))));
  const auth = describeAuth(request);
  if (auth) lines.push(`**Authentication:** ${auth}`, "");
  const body = describeBody(request.body);
  if (body) lines.push("**Body**", "", ...fence(body.text, body.language));
  for (const language of DOCS_SNIPPET_LANGUAGES) {
    lines.push(`*${DOCS_SNIPPET_LABELS[language]}*`, "");
    lines.push(...fence(requestSnippet(request, language), snippetFence(language)));
  }
  return lines;
}

function folderSection(folder: DocsFolder, level: number): string[] {
  const lines = [`${"#".repeat(level)} ${folder.name}`, ""];
  if (folder.docs.trim()) lines.push(folder.docs.trimEnd(), "");
  return lines;
}

export function renderDocsMarkdown(root: DocsFolder): string {
  const lines: string[] = [`# ${root.name}`, ""];
  if (root.docs.trim()) lines.push(root.docs.trimEnd(), "");

  const flat = flattenDocs(root).slice(1);
  if (flat.length > 0) {
    lines.push("## Index", "");
    for (const { item, depth } of flat) {
      const label = item.kind === "request" ? `\`${item.method}\` ${item.name}` : item.name;
      lines.push(`${"  ".repeat(depth - 1)}- ${label}`);
    }
    lines.push("");
  }

  const visit = (item: DocsItem, depth: number): void => {
    const level = Math.min(depth + 2, 6);
    if (item.kind === "folder") {
      lines.push(...folderSection(item, level));
      for (const child of item.children) visit(child, depth + 1);
    } else {
      lines.push(...requestSection(item, level));
    }
  };
  for (const child of root.children) visit(child, 1);

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

/**
 * Export da documentação em HTML de arquivo único (EP-12-T03): CSS e JS inline, sem CDN,
 * sem fonte nem imagem externa — abre offline. Índice navegável, busca, tema claro/escuro
 * (segue o do sistema, com botão para alternar) e os mesmos snippets/regras de segredo do
 * export em markdown. Markdown do usuário passa por `markdown-it` com HTML cru
 * desligado, então um `docs` malicioso não injeta script no arquivo exportado.
 *
 * Os valores de cor abaixo são o mesmo triplet de `assets/main.css`: o arquivo exportado
 * não carrega o Tailwind do app, e é o único lugar onde cor "crua" é inevitável.
 */

import type { KeyValueEntry } from "@shared";

import { rewriteAttachmentsInHtml } from "@renderer/lib/markdownAttachments";
import { escapeHtml } from "@renderer/lib/markdownVars";
import MarkdownIt from "markdown-it";

import { describeAuth } from "./exportMarkdown";
import {
  describeBody,
  DOCS_SNIPPET_LABELS,
  DOCS_SNIPPET_LANGUAGES,
  type DocsFolder,
  type DocsItem,
  type DocsRequest,
  enabledEntries,
  flattenDocs,
  redactHeaders,
  requestSnippet,
} from "./model";

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: false });

/** URL embutida de um anexo (`data:`), ou `null` para omitir — preenchida pelo export a partir do disco (EP-12). */
export type AttachmentResolver = (path: string) => string | null;

// Um único export roda por vez (síncrono); o resolvedor da chamada atual fica aqui para os helpers de seção.
let resolveAttachment: AttachmentResolver = () => null;

/** Markdown do usuário → HTML, com `attachments/` trocado por `data:` (ou omitido, sem resolvedor). */
function md(text: string): string {
  return rewriteAttachmentsInHtml(markdown.render(text), resolveAttachment);
}

const STYLE = `
:root{--bg:#f5f7fa;--panel:#fff;--soft:#eaeff4;--line:#cfdce8;--text:#2c3e50;--muted:#5480a3;--accent:#0a85bf;--code:#eaeff4}
:root[data-theme=dark]{--bg:#1d2834;--panel:#2c3e50;--soft:#2f475d;--line:#2f475d;--text:#eaeff4;--muted:#759cbb;--accent:#18aae5;--code:#1d2834}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;min-height:100vh}
nav{position:sticky;top:0;align-self:flex-start;width:300px;height:100vh;overflow:auto;padding:16px;border-right:1px solid var(--line);background:var(--panel);flex-shrink:0}
nav input{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text);font:inherit}
nav ul{list-style:none;margin:12px 0 0;padding:0}nav li a{display:block;padding:3px 6px;border-radius:4px;color:var(--text);text-decoration:none;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
nav li a:hover{background:var(--soft)}nav li.folder>a{font-weight:600}
main{flex:1;min-width:0;max-width:960px;padding:24px 32px 80px}
h1,h2,h3,h4,h5,h6{line-height:1.25}
section{border-top:1px solid var(--line);padding-top:8px;margin-top:24px}
.m{display:inline-block;min-width:3.6em;margin-right:6px;padding:0 6px;border-radius:4px;background:var(--soft);color:var(--accent);font:600 12px ui-monospace,monospace;text-align:center}
.sig{font:13px ui-monospace,monospace;background:var(--code);padding:8px 10px;border-radius:6px;overflow:auto}
table{border-collapse:collapse;margin:8px 0}th,td{border:1px solid var(--line);padding:4px 10px;text-align:left;font-size:13px}
pre{background:var(--code);padding:10px 12px;border-radius:6px;overflow:auto;font-size:13px}
code{font-family:ui-monospace,monospace;font-size:.92em}
.tabs button{border:1px solid var(--line);background:var(--panel);color:var(--text);padding:3px 10px;cursor:pointer;font:inherit;font-size:12px}
.tabs button[aria-selected=true]{background:var(--accent);color:#fff;border-color:var(--accent)}
.hidden{display:none}
#theme{position:fixed;right:16px;top:12px;border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:6px;padding:4px 10px;cursor:pointer}
@media(max-width:800px){body{display:block}nav{position:static;width:auto;height:auto;max-height:40vh}main{padding:16px}}
`;

const SCRIPT = `
(function(){
  var root=document.documentElement;
  var stored=null;try{stored=localStorage.getItem("wttp-docs-theme")}catch(e){}
  var dark=stored?stored==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-theme",dark?"dark":"light");
  document.getElementById("theme").addEventListener("click",function(){
    var next=root.getAttribute("data-theme")==="dark"?"light":"dark";
    root.setAttribute("data-theme",next);try{localStorage.setItem("wttp-docs-theme",next)}catch(e){}
  });
  var input=document.getElementById("search");
  var items=[].slice.call(document.querySelectorAll("nav li"));
  var sections=[].slice.call(document.querySelectorAll("main section"));
  input.addEventListener("input",function(){
    var q=input.value.trim().toLowerCase();
    sections.forEach(function(s){s.classList.toggle("hidden",q!==""&&s.textContent.toLowerCase().indexOf(q)===-1)});
    items.forEach(function(li){li.classList.toggle("hidden",q!==""&&li.textContent.toLowerCase().indexOf(q)===-1)});
  });
  [].slice.call(document.querySelectorAll(".tabs")).forEach(function(group){
    var buttons=[].slice.call(group.querySelectorAll("button"));
    var panes=[].slice.call(group.parentNode.querySelectorAll(".pane"));
    buttons.forEach(function(b,i){b.addEventListener("click",function(){
      buttons.forEach(function(x,j){x.setAttribute("aria-selected",j===i?"true":"false")});
      panes.forEach(function(p,j){p.classList.toggle("hidden",j!==i)});
    })});
  });
})();
`;

function tableHtml(title: string, entries: KeyValueEntry[]): string {
  if (entries.length === 0) return "";
  const withDescription = entries.some(entry => entry.description?.trim());
  const rows = entries
    .map(
      e =>
        `<tr><td><code>${escapeHtml(e.name)}</code></td><td><code>${escapeHtml(e.value)}</code></td>${
          withDescription ? `<td>${escapeHtml(e.description ?? "")}</td>` : ""
        }</tr>`,
    )
    .join("");
  return `<h4>${escapeHtml(title)}</h4><table><thead><tr><th>Name</th><th>Value</th>${withDescription ? "<th>Description</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>`;
}

function bodyHtml(request: DocsRequest): string {
  const body = describeBody(request.body);
  if (!body) return "";
  return `<h4>Body</h4><pre><code>${escapeHtml(body.text)}</code></pre>`;
}

function authHtml(request: DocsRequest): string {
  const text = describeAuth(request);
  if (!text) return "";
  // `describeAuth` devolve markdown inline (crases); renderizar escapado e simples.
  return `<p><strong>Authentication:</strong> ${markdown.renderInline(text)}</p>`;
}

function snippetsHtml(request: DocsRequest): string {
  const buttons = DOCS_SNIPPET_LANGUAGES.map(
    (language, index) =>
      `<button type="button" aria-selected="${index === 0}">${escapeHtml(DOCS_SNIPPET_LABELS[language])}</button>`,
  ).join("");
  const panes = DOCS_SNIPPET_LANGUAGES.map(
    (language, index) =>
      `<pre class="pane${index === 0 ? "" : " hidden"}"><code>${escapeHtml(requestSnippet(request, language))}</code></pre>`,
  ).join("");
  return `<div><div class="tabs" role="tablist">${buttons}</div>${panes}</div>`;
}

function requestHtml(request: DocsRequest, level: number): string {
  const heading = Math.min(level, 6);
  return `<section id="${escapeHtml(request.anchor)}">
<h${heading}><span class="m">${escapeHtml(request.method)}</span>${escapeHtml(request.name)}</h${heading}>
<div class="sig">${escapeHtml(request.method)} ${escapeHtml(request.url)}</div>
${request.docs.trim() ? md(request.docs) : ""}
${tableHtml("Path params", enabledEntries(request.pathParams))}
${tableHtml("Query params", enabledEntries(request.query))}
${tableHtml("Headers", enabledEntries(redactHeaders(request.headers)))}
${authHtml(request)}
${bodyHtml(request)}
${snippetsHtml(request)}
</section>`;
}

function folderHtml(folder: DocsFolder, level: number): string {
  const heading = Math.min(level, 6);
  return `<section id="${escapeHtml(folder.anchor)}">
<h${heading}>${escapeHtml(folder.name)}</h${heading}>
${folder.docs.trim() ? md(folder.docs) : ""}
</section>`;
}

function indexHtml(root: DocsFolder): string {
  const items = flattenDocs(root)
    .slice(1)
    .map(({ item, depth }) => {
      const label = item.kind === "request" ? `${item.method} ${item.name}` : item.name;
      return `<li class="${item.kind}" style="padding-left:${(depth - 1) * 12}px"><a href="#${escapeHtml(item.anchor)}">${escapeHtml(label)}</a></li>`;
    })
    .join("");
  return `<ul>${items}</ul>`;
}

export function renderDocsHtml(
  root: DocsFolder,
  attachments: AttachmentResolver = () => null,
): string {
  resolveAttachment = attachments;
  const body: string[] = [];
  const visit = (item: DocsItem, depth: number): void => {
    const level = depth + 1;
    if (item.kind === "folder") {
      body.push(folderHtml(item, level));
      for (const child of item.children) visit(child, depth + 1);
    } else {
      body.push(requestHtml(item, level));
    }
  };
  for (const child of root.children) visit(child, 1);

  const title = escapeHtml(root.name);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
<button id="theme" type="button" aria-label="Toggle theme">◐</button>
<nav><strong>${title}</strong><input id="search" type="search" placeholder="Search…" aria-label="Search">${indexHtml(root)}</nav>
<main>
<h1>${title}</h1>
${root.docs.trim() ? md(root.docs) : ""}
${body.join("\n")}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

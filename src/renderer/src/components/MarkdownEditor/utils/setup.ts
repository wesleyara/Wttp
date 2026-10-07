/** Configuração global do md-editor-v3. Por padrão ele baixa mermaid, katex, highlight.js, cropper,
 * prettier e echarts de um CDN; aqui entregamos as instâncias instaladas via npm (ou desligamos o
 * que não é usado), então o editor funciona offline — e sob a CSP do Wttp (`script-src 'self'`),
 * que bloquearia o CDN de qualquer jeito. As libs pesadas (mermaid, katex, highlight.js) entram por
 * `import()` dinâmico: só pesam no bundle inicial se um editor for de fato aberto.
 * Idempotente — pode ser chamada várias vezes; todas aguardam a mesma configuração. */
import { config } from "md-editor-v3";

let ready: Promise<void> | null = null;

async function configure(): Promise<void> {
  const [{ default: mermaid }, { default: katex }, { default: hljs }, hljsLight, hljsDark] =
    await Promise.all([
      import("mermaid"),
      import("katex"),
      import("highlight.js"),
      import("highlight.js/styles/atom-one-light.css?inline"),
      import("highlight.js/styles/atom-one-dark.css?inline"),
      import("katex/dist/katex.min.css"),
    ]);

  config({
    editorExtensions: {
      mermaid: { instance: mermaid },
      katex: { instance: katex },
      highlight: { instance: hljs },
      // O cropper só é usado pelo diálogo "recortar imagem" da toolbar nativa do md-editor, que não
      // exibimos (`:toolbars="[]"`). Um stub impede o download do cropperjs pelo CDN.
      cropper: { instance: class CropperStub {} },
    },
  });

  // Com a instância local o md-editor não injeta o CSS do highlight.js, então injetamos o tema
  // "atom", com uma variante para cada tema do editor.
  if (typeof document !== "undefined" && !document.getElementById("mde-hljs-theme")) {
    const style = document.createElement("style");
    style.id = "mde-hljs-theme";
    style.textContent = `.md-editor:not(.md-editor-dark){${hljsLight.default}}\n.md-editor-dark{${hljsDark.default}}`;
    document.head.appendChild(style);
  }
}

export function setupMarkdownEditor(): Promise<void> {
  ready ??= configure();
  return ready;
}

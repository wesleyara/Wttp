import { defineConfig } from "vitepress";

// O site público (Vercel, `vercel.json`) e a documentação empacotada no app
// (`yarn docs:build:offline`, servida pelo protocolo `wttp-docs:`) rodam na raiz `/`.
// `DOCS_BASE` continua existindo para hospedar sob um subcaminho, se um dia precisar.
const base = process.env.DOCS_BASE ?? "/";
const outDir = process.env.DOCS_OUT_DIR;
// Na doc empacotada no app (`DOCS_EMBEDDED`, ClickLocal #60) o tema segue sempre o do
// próprio Wttp: o main aplica `AppSettings.theme` em `nativeTheme.themeSource`, que é o
// `prefers-color-scheme` desta janela — `force-auto` segue isso e esconde o seletor de
// tema do VitePress, que brigaria com as Preferências do app. O site público mantém o
// seletor.
const embedded = process.env.DOCS_EMBEDDED === "1";

export default defineConfig({
  title: "Wttp",
  base,
  cleanUrls: true,
  appearance: embedded ? "force-auto" : true,
  ...(outDir ? { outDir } : {}),
  markdown: {
    config: md => {
      // O Wttp vive de `{{variável}}`: sem `v-pre`, o Vue tenta interpolar o que está
      // em código inline (blocos de código o VitePress já protege sozinho).
      const codeInline = md.renderer.rules.code_inline!;
      md.renderer.rules.code_inline = (...args) =>
        codeInline(...args).replace("<code", "<code v-pre");
    },
  },
  head: [["link", { rel: "icon", href: `${base}favicon.svg` }]],
  themeConfig: {
    socialLinks: [{ icon: "github", link: "https://github.com/wesleyara/Wttp" }],
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "Buscar", buttonAriaLabel: "Buscar na documentação" },
              modal: {
                displayDetails: "Mostrar lista detalhada",
                resetButtonTitle: "Limpar busca",
                backButtonTitle: "Fechar busca",
                noResultsText: "Nenhum resultado para",
                footer: {
                  selectText: "selecionar",
                  selectKeyAriaLabel: "enter",
                  navigateText: "navegar",
                  navigateUpKeyAriaLabel: "seta para cima",
                  navigateDownKeyAriaLabel: "seta para baixo",
                  closeText: "fechar",
                  closeKeyAriaLabel: "esc",
                },
              },
            },
          },
        },
      },
    },
  },
  locales: {
    root: {
      label: "Português (Brasil)",
      lang: "pt-BR",
      description: "Cliente HTTP local e open source para desenvolver, testar e documentar APIs.",
      themeConfig: {
        nav: [
          { text: "Guia", link: "/guia/instalacao" },
          { text: "API de scripts", link: "/guia/api-de-scripts" },
          { text: "Novidades", link: "/changelog" },
        ],
        sidebar: [
          {
            text: "Começando",
            items: [
              { text: "Instalação", link: "/guia/instalacao" },
              { text: "Primeiro workspace", link: "/guia/primeiro-workspace" },
            ],
          },
          {
            text: "Fazendo requests",
            items: [
              { text: "Montar e enviar uma request", link: "/guia/requests" },
              { text: "Environments e variáveis", link: "/guia/environments" },
              { text: "Autenticação e herança", link: "/guia/autenticacao" },
              { text: "Documentando suas APIs", link: "/guia/documentando-apis" },
            ],
          },
          {
            text: "Automação",
            items: [
              { text: "Scripts e testes", link: "/guia/scripts" },
              { text: "API de scripts", link: "/guia/api-de-scripts" },
              { text: "Runner e CI", link: "/guia/runner-e-ci" },
            ],
          },
          {
            text: "Workspace e equipe",
            items: [
              { text: "Importadores", link: "/guia/importadores" },
              { text: "Versionando com Git", link: "/guia/versionamento" },
            ],
          },
          {
            text: "Personalização",
            items: [{ text: "Atalhos de teclado", link: "/guia/atalhos" }],
          },
          {
            text: "Projeto",
            items: [{ text: "Novidades", link: "/changelog" }],
          },
        ],
        outline: { label: "Nesta página" },
        docFooter: { prev: "Anterior", next: "Próxima" },
        returnToTopLabel: "Voltar ao topo",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Tema",
        langMenuLabel: "Idioma",
      },
    },
    en: {
      label: "English",
      lang: "en",
      link: "/en/",
      description: "A local, open source HTTP client to develop, test and document APIs.",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/en/guide/installation" },
          { text: "Scripting API", link: "/en/guide/scripting-api" },
          { text: "Changelog", link: "/en/changelog" },
        ],
        sidebar: [
          {
            text: "Getting started",
            items: [
              { text: "Installation", link: "/en/guide/installation" },
              { text: "First workspace", link: "/en/guide/first-workspace" },
            ],
          },
          {
            text: "Making requests",
            items: [
              { text: "Build and send a request", link: "/en/guide/requests" },
              { text: "Environments and variables", link: "/en/guide/environments" },
              { text: "Authentication and inheritance", link: "/en/guide/authentication" },
              { text: "Documenting your APIs", link: "/en/guide/documenting-apis" },
            ],
          },
          {
            text: "Automation",
            items: [
              { text: "Scripts and tests", link: "/en/guide/scripts" },
              { text: "Scripting API", link: "/en/guide/scripting-api" },
              { text: "Runner and CI", link: "/en/guide/runner-and-ci" },
            ],
          },
          {
            text: "Workspace and team",
            items: [
              { text: "Importers", link: "/en/guide/importers" },
              { text: "Versioning with Git", link: "/en/guide/versioning" },
            ],
          },
          {
            text: "Customization",
            items: [{ text: "Keyboard shortcuts", link: "/en/guide/shortcuts" }],
          },
          {
            text: "Project",
            items: [{ text: "Changelog", link: "/en/changelog" }],
          },
        ],
      },
    },
  },
});

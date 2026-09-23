/**
 * Escalas e famílias tipográficas do Wttp.
 *
 * Este é o **único** lugar do repositório onde uma cor crua pode aparecer. Componentes
 * usam tokens semânticos (`bg-surface-2`, `text-muted`), definidos sobre estas escalas
 * no EP-02. Fonte da verdade: arch-docs/design-system.md.
 */

/**
 * Um token semântico vira `rgb(var(--w-x) / <alpha-value>)`: o valor da custom
 * property é o triplet "R G B" (sem `rgb()`), definido para os dois temas em
 * `src/renderer/src/assets/main.css`. É isso que permite `bg-surface-2/60` funcionar.
 */
function token(name) {
  return `rgb(var(--w-${name}) / <alpha-value>)`;
}

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{vue,js,ts}"],
  theme: {
    extend: {
      colors: {
        // Classes de topo (`text-1`, `border-subtle`, `ring-focus`) — não aninhadas —
        // porque é o nome de classe exato que arch-docs/design-system.md §2 define.
        surface: {
          1: token("surface-1"),
          2: token("surface-2"),
          3: token("surface-3"),
        },
        subtle: token("border-subtle"),
        strong: token("border-strong"),
        1: token("text-1"),
        muted: token("text-muted"),
        faint: token("text-faint"),
        accent: {
          DEFAULT: token("accent"),
          hover: token("accent-hover"),
        },
        focus: token("focus-ring"),
        method: {
          get: token("method-get"),
          post: token("method-post"),
          put: token("method-put"),
          patch: token("method-patch"),
          delete: token("method-delete"),
          neutral: token("method-neutral"),
        },
        status: {
          "2xx": token("status-2xx"),
          "3xx": token("status-3xx"),
          "4xx": token("status-4xx"),
          "5xx": token("status-5xx"),
          error: token("status-error"),
        },
        bluewood: {
          50: "#f5f7fa",
          100: "#eaeff4",
          200: "#cfdce8",
          300: "#a6bfd3",
          400: "#759cbb",
          500: "#5480a3",
          600: "#416788",
          700: "#35526f",
          800: "#2f475d",
          900: "#2c3e50",
          950: "#1d2834",
        },
        "brand-blue": {
          50: "#f1f9fe",
          100: "#e1f3fd",
          200: "#bde6fa",
          300: "#82d4f7",
          400: "#40bef0",
          500: "#18aae5",
          600: "#0a85bf",
          700: "#0a6a9a",
          800: "#0c5a80",
          900: "#104b6a",
          950: "#0b2f46",
        },
      },
      fontFamily: {
        // `sans` é o que o preflight do Tailwind aplica ao body — é assim que o Inter
        // vira o padrão da UI sem que a gente escreva uma regra de elemento própria.
        sans: ["Inter", "system-ui", "sans-serif"],
        inter: ["Inter", "system-ui", "sans-serif"],
        barlow: ["Barlow", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

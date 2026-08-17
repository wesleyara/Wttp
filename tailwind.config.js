/**
 * Escalas e famílias tipográficas do Wttp.
 *
 * Este é o **único** lugar do repositório onde uma cor crua pode aparecer. Componentes
 * usam tokens semânticos (`bg-surface-2`, `text-muted`), definidos sobre estas escalas
 * no EP-02. Fonte da verdade: docs/design-system.md.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{vue,js,ts}"],
  theme: {
    extend: {
      colors: {
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

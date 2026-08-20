import eslintConfigPrettier from "@electron-toolkit/eslint-config-prettier";
import tseslint from "@electron-toolkit/eslint-config-ts";
import eslintPluginPerfectionist from "eslint-plugin-perfectionist";
import eslintPluginTailwindcss from "eslint-plugin-tailwindcss";
import eslintPluginVue from "eslint-plugin-vue";
import { defineConfig } from "eslint/config";
import { fileURLToPath } from "url";
import vueParser from "vue-eslint-parser";

// Resolução relativa quebra a busca por `tailwindcss` dentro do plugin — precisa de
// um caminho absoluto.
const tailwindConfigPath = fileURLToPath(new URL("./tailwind.config.js", import.meta.url));

export default defineConfig(
  // docs/.vitepress is generated scaffolding for the docs site (config + default
  // theme), not app source — never brought in line with this project's stricter
  // TS/perfectionist rules, and its dev-server cache is regenerated on every run.
  { ignores: ["**/node_modules", "**/dist", "**/out", "docs/.vitepress/**"] },
  tseslint.configs.recommended,
  eslintPluginVue.configs["flat/recommended"],
  eslintPluginTailwindcss.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        extraFileExtensions: [".vue"],
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ["**/*.{ts,mts,tsx,vue}"],
    rules: {
      "vue/require-default-prop": "off",
      "vue/multi-word-component-names": "off",
      "vue/block-lang": [
        "error",
        {
          script: {
            lang: "ts",
          },
        },
      ],
    },
  },
  {
    // docs/design-system.md regra nº1: componentes nunca referenciam uma cor crua da
    // escala (`bluewood-900`, `brand-blue-500`) — só o token semântico (`bg-surface-2`).
    // A escala crua só pode aparecer na própria definição dos tokens (tailwind.config.js).
    // `no-restricted-syntax` (core) não enxerga o `templateBody` do vue-eslint-parser —
    // só rules do próprio eslint-plugin-vue, com `defineTemplateBodyVisitor`, veem.
    files: ["**/*.vue"],
    rules: {
      "vue/no-restricted-class": ["error", "/(bluewood|brand-blue)-\\d{2,3}/"],
      "no-restricted-syntax": [
        "error",
        {
          // Cobre string literal fora do `class=`/`:class` — ex. um `computed` que monta
          // classe crua em JS dentro do `<script setup>`.
          selector: "Literal[value=/\\b(bluewood|brand-blue)-\\d{2,3}\\b/]",
          message:
            "Cor crua da escala (bluewood-*/brand-blue-*) não é permitida em componentes — use um token semântico (docs/design-system.md §2).",
        },
      ],
    },
  },
  {
    plugins: { perfectionist: eslintPluginPerfectionist },
    rules: {
      "perfectionist/sort-imports": "error",
      "perfectionist/sort-named-imports": "error",
    },
  },
  {
    settings: {
      tailwindcss: {
        config: tailwindConfigPath,
      },
    },
    rules: {
      "tailwindcss/classnames-order": "error",
      "tailwindcss/enforces-shorthand": "error",
      "tailwindcss/no-contradicting-classname": "error",
      // Componentes só usam tokens semânticos — nunca uma classe de cor crua — mas
      // essa regra não sabe disso. `no-custom-classname` fica off para não brigar
      // com os tokens do design system, ainda não escritos.
      "tailwindcss/no-custom-classname": "off",
    },
  },
  eslintConfigPrettier,
);

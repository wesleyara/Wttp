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
  { ignores: ["**/node_modules", "**/dist", "**/out"] },
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

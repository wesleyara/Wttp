import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

// Sem isso, `vitest` (rodado fora do `electron-vite`) não resolve `@renderer`/`@shared`
// — os mesmos aliases já existem em `electron.vite.config.ts` para o app de verdade;
// aqui só espelhamos os dois que testes chegam a importar em runtime (o preload não
// tem alias próprio além de `@shared`, então não precisa entrar aqui).
//
// `vue()` deixa testes importarem `.vue` de verdade (compilado, não mockado) quando
// precisam montar um componente de verdade — ex. reproduzir um bug que só aparece na
// interação real entre `WCodeEditor`/CodeMirror e o v-model, não na lógica pura.
// `environment` continua "node" por padrão (testes do main process não têm DOM); um
// arquivo que precisa de DOM liga com `// @vitest-environment jsdom` no topo.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@renderer": resolve("src/renderer/src"),
      "@shared": resolve("src/shared"),
    },
  },
});

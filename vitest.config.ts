import { resolve } from "path";
import { defineConfig } from "vitest/config";

// Sem isso, `vitest` (rodado fora do `electron-vite`) não resolve `@renderer`/`@shared`
// — os mesmos aliases já existem em `electron.vite.config.ts` para o app de verdade;
// aqui só espelhamos os dois que testes chegam a importar em runtime (o preload não
// tem alias próprio além de `@shared`, então não precisa entrar aqui).
export default defineConfig({
  resolve: {
    alias: {
      "@renderer": resolve("src/renderer/src"),
      "@shared": resolve("src/shared"),
    },
  },
});

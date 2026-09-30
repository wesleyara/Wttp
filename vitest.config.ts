import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { configDefaults, defineConfig } from "vitest/config";

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
  test: {
    // Vários specs criam centenas de arquivos ou sobem processos `git`/servidores de
    // verdade; nos runners Windows/macOS do CI só essa preparação passa fácil dos 5s
    // padrão do Vitest. Os orçamentos de desempenho medidos (`< 300ms`, `< 1s`, `< 5s`)
    // são asserções dentro dos testes e seguem valendo — isto só evita que a preparação
    // lenta reprove o teste por timeout.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // EP-10-T02: `e2e/**` são specs do Playwright (`@playwright/test`), rodados por
    // `yarn test:e2e`/`playwright test`, nunca pelo Vitest — sem isso, o padrão de
    // include do Vitest (`**/*.spec.ts`) tentaria carregá-los e quebraria em `import
    // "@playwright/test"`, que não existe no runtime do Vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
    // EP-10-T01: cobertura obrigatória só nas três camadas puras e testáveis sem
    // Electron (arch-docs/conventions.md §Testes). O resto do main (ipc/, config/,
    // scripts/, secrets/) e o renderer inteiro ficam fora — não é escopo desta task.
    coverage: {
      provider: "v8",
      include: ["src/main/http/**", "src/main/storage/**", "src/main/importers/**"],
      exclude: ["**/*.spec.ts", "**/__fixtures__/**", "**/__snapshots__/**"],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 80,
        branches: 80,
      },
    },
  },
});

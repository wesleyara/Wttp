import { defineConfig } from "@playwright/test";

// EP-10-T02: E2E via o driver de Electron do Playwright (`_electron`), não o runner de
// browser normal — cada teste sobe o app de verdade (`out/main/index.js`, empacotado por
// `yarn build`) num diretório de usuário e num diretório de workspaces isolados
// (`e2e/fixtures.ts`). `workers: 1` porque cada teste já é um processo Electron inteiro;
// rodar em paralelo só multiplicaria o custo de CPU/memória sem ganho real numa suíte de
// quatro fluxos.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    // Critério de aceite "falha produz screenshot e trace" (EP-10-T02).
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});

import type { ElectronApplication, Page } from "@playwright/test";

import { test as base, _electron as electron } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// `out/main/index.js` — o build de produção (`yarn build`), não o servidor de dev do
// Vite. Mais estável para E2E: sem HMR, sem depender de uma porta livre, o mesmo
// artefato que `yarn build:linux` empacota (arch-docs/architecture.md).
export const MAIN_ENTRY = resolve(__dirname, "../out/main/index.js");

/**
 * Este sandbox de dev roda com `ELECTRON_RUN_AS_NODE=1` no ambiente (o
 * processo que o lança é um app Electron) — herdado por qualquer processo filho, faz o binário do
 * Electron rodar como Node puro em vez de abrir a app, e todo `--flag` de Chromium
 * (`--no-sandbox`, `--headless=new`, ...) que o Playwright/nós passamos vira "bad
 * option". Sem relação com o app do Wttp; precisa ser removido só na invocação do
 * teste, nunca setado/lido por `src/main`.
 */
export const LAUNCH_ENV: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: undefined };

interface WttpFixtures {
  /** `app.getPath("userData")` isolado por teste — settings, recentes e ui-state nunca colidem entre execuções. */
  userDataDir: string;
  /** Pasta onde os workspaces de teste são criados — nunca a raiz de workspaces de um usuário real. */
  workspacesRoot: string;
  electronApp: ElectronApplication;
  /** A `BrowserWindow` principal, já com o `document` carregado. */
  window: Page;
}

export const test = base.extend<WttpFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature requires the destructure.
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "wttp-e2e-userdata-"));
    // Idioma fixo em inglês: sem isso o app segue o idioma do SO (`language: "system"`)
    // e os seletores por texto quebrariam numa máquina em português (EP-08.1-T06).
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ theme: "system", language: "en" }));
    try {
      await use(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature requires the destructure.
  workspacesRoot: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "wttp-e2e-workspaces-"));
    try {
      await use(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },

  electronApp: async ({ userDataDir }, use) => {
    // `--headless=new`/`--disable-gpu` só na *invocação de teste* — nunca no
    // `src/main/index.ts` de produção (EP-10-T02). Verificado
    // à parte que esta combinação renderiza sem Xvfb/GPU real neste sandbox.
    const app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, "--headless=new", "--disable-gpu"],
      env: LAUNCH_ENV,
      // O Playwright emula `prefers-color-scheme: light` por padrão, o que esconde o
      // `nativeTheme.themeSource` que o app aplica a partir do tema das Preferências
      // (card #60) — `null` deixa a media query com o valor real, como fora do teste.
      colorScheme: null,
    });
    try {
      await use(app);
    } finally {
      await app.close().catch(() => undefined);
    }
  },

  window: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await use(page);
  },
});

export { expect } from "@playwright/test";

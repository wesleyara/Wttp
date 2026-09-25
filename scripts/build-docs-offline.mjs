// Build da documentação para dentro do app (EP-08.1-T07): base `/` (servida pelo
// protocolo `wttp-docs:`, não pela Vercel) e saída em `resources/docs-site`, que o
// electron-builder já empacota. Node em vez de `VAR=x cmd` para funcionar no Windows.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const outDir = resolve(import.meta.dirname, "..", "resources", "docs-site");
const result = spawnSync("npx", ["vitepress", "build", "docs"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  // `DOCS_EMBEDDED`: o tema segue o do app, sem seletor próprio (docs/.vitepress/config.mts).
  env: { ...process.env, DOCS_BASE: "/", DOCS_OUT_DIR: outDir, DOCS_EMBEDDED: "1" },
});
process.exit(result.status ?? 1);

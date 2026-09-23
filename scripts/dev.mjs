// `yarn dev`: Electron + Vite (HMR) e o VitePress da documentação juntos. O VitePress
// roda com base `/` numa porta fixa; o main lê `WTTP_DOCS_DEV_URL` e, em dev, faz a janela
// de documentação apontar para ele em vez da cópia empacotada — editar um `.md` atualiza
// a janela ao vivo. Node em vez de `VAR=x cmd`/`concurrently` para funcionar no Windows.
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const DOCS_PORT = 5174;
const isWindows = process.platform === "win32";
const root = resolve(import.meta.dirname, "..");
// Direto pelo `node`, sem `npx`/shell: o wrapper deixava o vitepress órfão ao encerrar.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- plain .mjs script
const bin = (name, file) => resolve(root, "node_modules", name, "bin", file);

const docs = spawn(
  "npx",
  ["vitepress", "dev", "docs", "--port", String(DOCS_PORT), "--strictPort"],
  {
    stdio: "inherit",
    env: { ...process.env, DOCS_BASE: "/" },
  },
);
const app = spawn(process.execPath, [bin("electron-vite", "electron-vite.js"), "dev"], {
  stdio: "inherit",
  detached: !isWindows,
  env: { ...process.env, WTTP_DOCS_DEV_URL: `http://localhost:${DOCS_PORT}` },
});

// `npx` é só um wrapper: matar só ele deixaria o vitepress/electron órfãos. Posix mata o
// grupo de processos (`detached`), Windows usa `taskkill /T`.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- plain .mjs script
function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* já saiu */
    }
  }
}

let exiting = false;
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- plain .mjs script, no TS annotations
function shutdown(code) {
  if (exiting) return;
  exiting = true;
  killTree(docs);
  killTree(app);
  process.exit(code ?? 0);
}

app.on("exit", code => shutdown(code));
docs.on("exit", code => {
  // Docs caindo (porta ocupada, erro de config) não deve derrubar o app em silêncio.
  if (!exiting) console.error(`[dev] vitepress exited (code ${code}); the app keeps running.`);
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

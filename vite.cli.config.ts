import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// CLI `wttp run` (EP-13-T02): Node puro, sem Electron. Um bundle ESM com tudo dentro
// (inclusive `yaml`), para `npx wttp-cli` não precisar instalar dependência nenhuma, e o
// worker de scripts ao lado — `child_process.fork` precisa de um arquivo em disco, pelo
// mesmo motivo do `scripts/worker` no `electron.vite.config.ts`.
const cliPackage = JSON.parse(readFileSync(resolve("cli/package.json"), "utf-8")) as {
  version: string;
};

export default defineConfig({
  resolve: {
    alias: { "@shared": resolve("src/shared") },
  },
  define: {
    __WTTP_CLI_VERSION__: JSON.stringify(cliPackage.version),
  },
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: true,
    target: "node20",
    outDir: "cli/dist",
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: {
        wttp: resolve("src/cli/index.ts"),
        "script-worker": resolve("src/main/scripts/worker.ts"),
      },
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
        chunkFileNames: "chunks/[name]-[hash].mjs",
        banner: chunk => (chunk.name === "wttp" ? "#!/usr/bin/env node" : ""),
      },
    },
  },
});

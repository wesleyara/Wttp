import vue from "@vitejs/plugin-vue";
import { defineConfig } from "electron-vite";
import { resolve } from "path";

// `@shared` precisa estar nos três blocos: o alias resolvido em um só quebra o
// build dos outros dois. O par deste arquivo é tsconfig.node.json + tsconfig.web.json.
const shared = resolve("src/shared");

export default defineConfig({
  main: {
    resolve: {
      alias: { "@shared": shared },
    },
    build: {
      rollupOptions: {
        // Segunda entrada: o `utilityProcess.fork` do runner de scripts (EP-09-T01)
        // precisa de um arquivo próprio em disco (`out/main/scripts/worker.js`) — não dá
        // para spawnar uma função dentro do bundle único do `index.js`.
        input: {
          index: resolve("src/main/index.ts"),
          "scripts/worker": resolve("src/main/scripts/worker.ts"),
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: { "@shared": shared },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": shared,
      },
    },
    plugins: [vue()],
  },
});

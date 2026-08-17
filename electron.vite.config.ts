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

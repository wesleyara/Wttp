import HomePage from "@renderer/pages/HomePage.vue";
import { createRouter, createWebHashHistory } from "vue-router";

// `createWebHistory` depende de um servidor HTTP; o app empacotado serve os arquivos
// via `file://`, onde só o hash funciona.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: "/", name: "home", component: HomePage }],
});

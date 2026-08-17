import HomePage from "@renderer/pages/HomePage.vue";
import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

// `createWebHistory` depende de um servidor HTTP; o app empacotado serve os arquivos
// via `file://`, onde só o hash funciona.
const routes: RouteRecordRaw[] = [{ path: "/", name: "home", component: HomePage }];

// A galeria de componentes (EP-02-T03) só existe em dev — nunca navegável no build
// empacotado que o usuário final abre.
if (import.meta.env.DEV) {
  routes.push({
    path: "/dev/gallery",
    name: "dev-gallery",
    component: () => import("@renderer/pages/DevGalleryPage.vue"),
  });
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

import "./assets/fonts";
import "./assets/main.css";
import "./assets/icons";

import { useSettingsStore } from "@renderer/stores/settings";
import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { router } from "./router";

const app = createApp(App);
app.use(createPinia());
app.use(router);

// Resolve o tema persistido antes de montar — index.html já assume `dark` estático
// para o caso comum; isso só corrige quando a preferência real é `light`.
void useSettingsStore()
  .load()
  .finally(() => app.mount("#app"));

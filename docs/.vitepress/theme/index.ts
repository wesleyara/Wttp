import type { Theme } from "vitepress";

import { useData } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { watch } from "vue";

import "./style.css";

export default {
  extends: DefaultTheme,
  setup() {
    // Doc empacotada no app (`appearance: "force-auto"`, ClickLocal #60): o VitePress lê
    // `prefers-color-scheme` só no carregamento — `isDark` acompanha a media query, mas
    // nada mais põe/tira a classe `dark`. Sem isto, trocar o tema nas Preferências do Wttp
    // com a doc aberta só refletiria ao navegar para outra página.
    const { isDark, site } = useData();
    if (site.value.appearance !== "force-auto") return;
    watch(isDark, dark => document.documentElement.classList.toggle("dark", dark));
  },
} satisfies Theme;

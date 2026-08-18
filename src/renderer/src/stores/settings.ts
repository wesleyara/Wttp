import type { AppSettings } from "@shared";

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

/**
 * Tema do app (EP-02-T05): persistido via IPC nas configurações do app (não do
 * workspace, ao contrário de `useUiStore`). `system` acompanha `prefers-color-scheme`
 * em tempo real; sem sinal do SO, cai em `dark` — é o padrão do produto
 * (docs/design-system.md §2).
 */
export const useSettingsStore = defineStore("settings", () => {
  const theme = ref<AppSettings["theme"]>("system");
  const defaultWorkspaceDir = ref<string | undefined>(undefined);
  const systemPrefersLight = ref(
    typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)").matches : false,
  );

  const resolvedTheme = computed<"dark" | "light">(() => {
    if (theme.value === "system") return systemPrefersLight.value ? "light" : "dark";
    return theme.value;
  });

  function applyToDocument(): void {
    document.documentElement.classList.toggle("dark", resolvedTheme.value === "dark");
  }

  watch(resolvedTheme, applyToDocument);

  async function load(): Promise<void> {
    const settings = await window.wttp.settings.get();
    theme.value = settings.theme;
    defaultWorkspaceDir.value = settings.defaultWorkspaceDir;
    applyToDocument();
  }

  function setTheme(next: AppSettings["theme"]): void {
    theme.value = next;
    void window.wttp.settings.set({ theme: next });
  }

  function setDefaultWorkspaceDir(next: string | undefined): void {
    defaultWorkspaceDir.value = next;
    void window.wttp.settings.set({ defaultWorkspaceDir: next });
  }

  if (typeof matchMedia === "function") {
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", event => {
      systemPrefersLight.value = event.matches;
    });
  }

  return { theme, resolvedTheme, defaultWorkspaceDir, load, setTheme, setDefaultWorkspaceDir };
});

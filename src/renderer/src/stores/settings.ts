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
  const workspacesRootDir = ref<string | undefined>(undefined);
  const systemPrefersLight = ref(
    typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)").matches : false,
  );

  const resolvedTheme = computed<"dark" | "light">(() => {
    if (theme.value === "system") return systemPrefersLight.value ? "light" : "dark";
    return theme.value;
  });

  /** `<workspacesRootDir>/wttp` — onde o app cria e enumera workspaces (Preferences). */
  const workspacesContainerDir = computed<string | undefined>(() =>
    workspacesRootDir.value ? `${workspacesRootDir.value}/wttp` : undefined,
  );

  function applyToDocument(): void {
    document.documentElement.classList.toggle("dark", resolvedTheme.value === "dark");
  }

  watch(resolvedTheme, applyToDocument);

  async function load(): Promise<void> {
    const settings = await window.wttp.settings.get();
    theme.value = settings.theme;
    workspacesRootDir.value = settings.workspacesRootDir;
    applyToDocument();
  }

  function setTheme(next: AppSettings["theme"]): void {
    theme.value = next;
    void window.wttp.settings.set({ theme: next });
  }

  function setWorkspacesRootDir(next: string | undefined): void {
    workspacesRootDir.value = next;
    void window.wttp.settings.set({ workspacesRootDir: next });
  }

  async function resetToDefaults(): Promise<void> {
    const settings = await window.wttp.settings.reset();
    theme.value = settings.theme;
    workspacesRootDir.value = settings.workspacesRootDir;
    applyToDocument();
  }

  if (typeof matchMedia === "function") {
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", event => {
      systemPrefersLight.value = event.matches;
    });
  }

  return {
    theme,
    resolvedTheme,
    workspacesRootDir,
    workspacesContainerDir,
    load,
    setTheme,
    setWorkspacesRootDir,
    resetToDefaults,
  };
});

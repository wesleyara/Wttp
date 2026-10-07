import type { AppSettings, MenuAction } from "@shared";

import { applyLanguageSetting } from "@renderer/i18n";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

/**
 * Tema do app (EP-02-T05): persistido via IPC nas configurações do app (não do
 * workspace, ao contrário de `useUiStore`). `system` acompanha `prefers-color-scheme`
 * em tempo real; sem sinal do SO, cai em `dark` — é o padrão do produto
 * (arch-docs/design-system.md §2).
 */
export const useSettingsStore = defineStore("settings", () => {
  const theme = ref<AppSettings["theme"]>("system");
  const language = ref<AppSettings["language"]>("system");
  const codegenLanguage = ref<string | undefined>(undefined);
  const workspacesRootDir = ref<string | undefined>(undefined);
  /** `undefined` (settings ainda não carregadas, ou salvas antes deste campo existir) se comporta como `true` — mesma regra de `AppSettings.autoUpdateEnabled` (EP-11-T03). */
  const autoUpdateEnabled = ref<boolean>(true);
  /** Só as ações remapeadas — ação ausente cai no acelerador de `defaultAccelerators`. */
  const shortcuts = ref<Partial<Record<MenuAction, string>>>({});
  /** Comando do terminal de "Open terminal"; vazio = detecta o do SO. */
  const terminalCommand = ref<string>("");
  /** Shell do terminal embutido (#169); vazio = o do SO. */
  const terminalShell = ref<string>("");
  /** Minutos entre os `git fetch` em segundo plano (#56); 0 desliga. */
  const gitFetchIntervalMinutes = ref<number>(5);
  const defaultAccelerators = ref<Record<MenuAction, string> | undefined>(undefined);
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
    const [settings, defaults] = await Promise.all([
      window.wttp.settings.get(),
      defaultAccelerators.value
        ? Promise.resolve(defaultAccelerators.value)
        : window.wttp.menu.getDefaultAccelerators(),
    ]);
    theme.value = settings.theme;
    language.value = settings.language ?? "system";
    codegenLanguage.value = settings.codegenLanguage;
    workspacesRootDir.value = settings.workspacesRootDir;
    autoUpdateEnabled.value = settings.autoUpdateEnabled !== false;
    shortcuts.value = settings.shortcuts ?? {};
    terminalCommand.value = settings.terminalCommand ?? "";
    terminalShell.value = settings.terminalShell ?? "";
    gitFetchIntervalMinutes.value = settings.gitFetchIntervalMinutes ?? 5;
    defaultAccelerators.value = defaults;
    applyToDocument();
    applyLanguageSetting(language.value);
  }

  /** Acelerador em uso agora para `action` — remapeado, ou o padrão de `menu.ts`. */
  function effectiveAccelerator(action: MenuAction): string | undefined {
    return shortcuts.value[action] ?? defaultAccelerators.value?.[action];
  }

  /** Ação que já usa `accelerator`, se houver — `null` se estiver livre. `excluding` ignora a própria ação sendo editada. */
  function findAcceleratorOwner(accelerator: string, excluding?: MenuAction): MenuAction | null {
    if (!defaultAccelerators.value) return null;
    const action = (Object.keys(defaultAccelerators.value) as MenuAction[]).find(candidate => {
      if (candidate === excluding) return false;
      return effectiveAccelerator(candidate) === accelerator;
    });
    return action ?? null;
  }

  function setShortcut(action: MenuAction, accelerator: string): void {
    const next = { ...shortcuts.value, [action]: accelerator };
    shortcuts.value = next;
    void window.wttp.settings.set({ shortcuts: next });
  }

  function restoreShortcut(action: MenuAction): void {
    const next = { ...shortcuts.value };
    delete next[action];
    shortcuts.value = next;
    void window.wttp.settings.set({ shortcuts: next });
  }

  /** Só os atalhos — ao contrário de `resetToDefaults`, não mexe em tema nem pasta de workspaces. */
  function setTerminalCommand(command: string): void {
    terminalCommand.value = command;
    void window.wttp.settings.set({ terminalCommand: command.trim() });
  }

  function setTerminalShell(shell: string): void {
    terminalShell.value = shell;
    void window.wttp.settings.set({ terminalShell: shell.trim() });
  }

  function resetShortcuts(): void {
    shortcuts.value = {};
    void window.wttp.settings.set({ shortcuts: {} });
  }

  function setTheme(next: AppSettings["theme"]): void {
    theme.value = next;
    void window.wttp.settings.set({ theme: next });
  }

  function setLanguage(next: AppSettings["language"]): void {
    language.value = next;
    applyLanguageSetting(next);
    void window.wttp.settings.set({ language: next });
  }

  function setCodegenLanguage(next: string): void {
    codegenLanguage.value = next;
    void window.wttp.settings.set({ codegenLanguage: next });
  }

  function setWorkspacesRootDir(next: string | undefined): void {
    workspacesRootDir.value = next;
    void window.wttp.settings.set({ workspacesRootDir: next });
  }

  function setGitFetchIntervalMinutes(next: number): void {
    gitFetchIntervalMinutes.value = next;
    void window.wttp.settings.set({ gitFetchIntervalMinutes: next });
  }

  function setAutoUpdateEnabled(next: boolean): void {
    autoUpdateEnabled.value = next;
    void window.wttp.settings.set({ autoUpdateEnabled: next });
  }

  async function resetToDefaults(): Promise<void> {
    const settings = await window.wttp.settings.reset();
    theme.value = settings.theme;
    language.value = settings.language ?? "system";
    codegenLanguage.value = settings.codegenLanguage;
    workspacesRootDir.value = settings.workspacesRootDir;
    autoUpdateEnabled.value = settings.autoUpdateEnabled !== false;
    shortcuts.value = settings.shortcuts ?? {};
    terminalCommand.value = settings.terminalCommand ?? "";
    terminalShell.value = settings.terminalShell ?? "";
    gitFetchIntervalMinutes.value = settings.gitFetchIntervalMinutes ?? 5;
    applyToDocument();
    applyLanguageSetting(language.value);
  }

  if (typeof matchMedia === "function") {
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", event => {
      systemPrefersLight.value = event.matches;
    });
  }

  return {
    theme,
    language,
    codegenLanguage,
    setCodegenLanguage,
    resolvedTheme,
    workspacesRootDir,
    workspacesContainerDir,
    autoUpdateEnabled,
    shortcuts,
    terminalCommand,
    terminalShell,
    gitFetchIntervalMinutes,
    setGitFetchIntervalMinutes,
    defaultAccelerators,
    load,
    setTheme,
    setLanguage,
    setWorkspacesRootDir,
    setAutoUpdateEnabled,
    effectiveAccelerator,
    findAcceleratorOwner,
    setShortcut,
    setTerminalCommand,
    setTerminalShell,
    restoreShortcut,
    resetShortcuts,
    resetToDefaults,
  };
});

<script setup lang="ts">
import { useAppStore } from "@renderer/stores/app";
import { useSettingsStore } from "@renderer/stores/settings";
import { useUpdateStore } from "@renderer/stores/update";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, onMounted, ref, watch } from "vue";

import PreferencesSection from "./PreferencesSection.vue";
import WButton from "./WButton.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WModal from "./WModal.vue";
import WSelect from "./WSelect.vue";

/**
 * Preferências (EP-08.1-T05) — `WModal size="lg"` com navegação lateral de seções, no
 * lugar do único bloco (pasta raiz de workspaces) que a tela tinha desde EP-06.1.
 * Idioma fica de fora da seção General por ora: `AppSettings.language` só existe a
 * partir de EP-08.1-T06, sem i18n nenhum ainda não há o que oferecer aqui.
 */
const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const settings = useSettingsStore();
const workspace = useWorkspaceStore();
const appStore = useAppStore();
const updateStore = useUpdateStore();

type SectionId = "general" | "workspaces" | "updates" | "shortcuts" | "about";

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "sun-moon" },
  { id: "workspaces", label: "Workspaces", icon: "folder" },
  { id: "updates", label: "Updates", icon: "download" },
  { id: "shortcuts", label: "Shortcuts", icon: "keyboard" },
  { id: "about", label: "About", icon: "info" },
];

const AUTO_UPDATE_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

/**
 * EP-11-T03 — nunca alarmante mesmo em erro (falha de rede na checagem é silenciosa
 * por critério de aceite): a pior mensagem daqui é "will retry automatically", nunca
 * um "something went wrong".
 */
const updateStatusLabel = computed<string>(() => {
  const status = updateStore.status;
  switch (status.state) {
    case "idle":
      return "Not checked yet.";
    case "checking":
      return "Checking for updates…";
    case "available":
      return `Version ${status.version} found — downloading…`;
    case "not-available":
      return "You're up to date.";
    case "downloading":
      return `Downloading update… ${status.percent}%`;
    case "downloaded":
      return `Version ${status.version} ready — restart to install.`;
    case "error":
      return "Couldn't check for updates. Will try again automatically.";
    case "unsupported":
      return "Installed from a .deb package — updates come from your package manager (apt/dpkg), not from inside the app.";
    default:
      return "";
  }
});

const isUnsupportedLinuxPackage = computed<boolean>(
  () => updateStore.status.state === "unsupported",
);

const activeSection = ref<SectionId>("general");

/** Primeiro clique só avisa — segundo clique (com o aviso visível) reseta de verdade. */
const resetConfirming = ref(false);

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const REPO_URL = "https://github.com/wesleyara/Wttp";
// Destino provisório até EP-08.1-T07 publicar o site de documentação de verdade.
const DOCS_URL = "https://github.com/wesleyara/Wttp/tree/main/docs";

onMounted(() => void appStore.ping());

function close(): void {
  emit("close");
}

function onSectionKeydown(event: KeyboardEvent): void {
  const index = SECTIONS.findIndex(section => section.id === activeSection.value);
  if (index === -1) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeSection.value = SECTIONS[(index + 1) % SECTIONS.length].id;
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeSection.value = SECTIONS[(index - 1 + SECTIONS.length) % SECTIONS.length].id;
  }
}

async function changeWorkspacesRootDir(): Promise<void> {
  const path = await workspace.pickFolder(settings.workspacesRootDir);
  if (path) settings.setWorkspacesRootDir(path);
}

watch(
  () => props.open,
  isOpen => {
    if (!isOpen) resetConfirming.value = false;
  },
);

async function onRestoreDefaults(): Promise<void> {
  if (!resetConfirming.value) {
    resetConfirming.value = true;
    return;
  }
  resetConfirming.value = false;
  await settings.resetToDefaults();
}
</script>

<template>
  <WModal :open="open" title="Preferences" size="lg" @close="close">
    <div class="flex h-[28rem] min-h-0">
      <div
        role="tablist"
        aria-label="Preferences sections"
        class="flex w-40 shrink-0 flex-col gap-0.5 border-r border-subtle pr-2"
        @keydown="onSectionKeydown"
      >
        <button
          v-for="section in SECTIONS"
          :key="section.id"
          role="tab"
          type="button"
          :aria-selected="section.id === activeSection"
          :tabindex="section.id === activeSection ? 0 : -1"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left font-inter text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          :class="
            section.id === activeSection
              ? 'bg-surface-3 text-1'
              : 'text-muted hover:bg-surface-3/50 hover:text-1'
          "
          @click="activeSection = section.id"
        >
          <WIcon :name="section.icon" size="3.5" />
          {{ section.label }}
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto pl-4">
        <div v-if="activeSection === 'general'" class="flex flex-col gap-4">
          <PreferencesSection title="Theme" description="Applies immediately, no restart needed.">
            <div class="w-40">
              <WSelect
                :model-value="settings.theme"
                :options="THEME_OPTIONS"
                @update:model-value="value => settings.setTheme(value as typeof settings.theme)"
              />
            </div>
          </PreferencesSection>

          <PreferencesSection
            title="Restore factory defaults"
            description="Resets every app setting on this screen (theme, workspaces root folder) back to its default. Doesn't touch any workspace or its data."
          >
            <div class="flex flex-col items-start gap-2">
              <WButton size="sm" variant="danger" @click="onRestoreDefaults">
                {{ resetConfirming ? "Click again to confirm" : "Restore factory defaults" }}
              </WButton>
              <p v-if="resetConfirming" class="font-inter text-xs text-status-5xx">
                This can't be undone.
              </p>
            </div>
          </PreferencesSection>
        </div>

        <div v-else-if="activeSection === 'workspaces'" class="flex flex-col gap-4">
          <PreferencesSection
            title="Workspaces root folder"
            description="Workspaces created without picking a folder, and the workspace switcher on the landing screen, use this folder."
          >
            <div class="flex items-center gap-2">
              <p
                class="flex-1 truncate rounded-md border border-subtle bg-surface-3 px-2 py-1.5 font-mono text-xs text-1"
              >
                {{ settings.workspacesRootDir ?? "Not set" }}
              </p>
              <WButton size="sm" variant="secondary" @click="changeWorkspacesRootDir">
                Change…
              </WButton>
            </div>
            <p v-if="settings.workspacesContainerDir" class="font-mono text-[11px] text-faint">
              Workspaces are created in: {{ settings.workspacesContainerDir }}/
            </p>
            <p v-else class="font-inter text-xs text-status-5xx">
              Set this before creating a workspace — new workspaces can't be created without it.
            </p>
          </PreferencesSection>
        </div>

        <div v-else-if="activeSection === 'updates'" class="flex flex-col gap-4">
          <PreferencesSection
            title="Automatic updates"
            description="Checks for a new version on startup and periodically in the background, and downloads it silently — installing still waits for you to restart the app or click Update now."
          >
            <div class="w-28">
              <WSelect
                :model-value="settings.autoUpdateEnabled ? 'on' : 'off'"
                :options="AUTO_UPDATE_OPTIONS"
                :disabled="isUnsupportedLinuxPackage"
                @update:model-value="value => settings.setAutoUpdateEnabled(value === 'on')"
              />
            </div>
          </PreferencesSection>

          <PreferencesSection title="Status">
            <p class="font-inter text-xs text-muted">{{ updateStatusLabel }}</p>
          </PreferencesSection>

          <PreferencesSection v-if="!isUnsupportedLinuxPackage" title="Check now">
            <WButton
              size="sm"
              variant="secondary"
              :disabled="updateStore.status.state === 'checking'"
              @click="updateStore.check()"
            >
              Check for updates
            </WButton>
          </PreferencesSection>
        </div>

        <WEmptyState
          v-else-if="activeSection === 'shortcuts'"
          title="No shortcuts to customize yet"
          description="Keyboard shortcut customization is planned for a future update."
        >
          <template #icon>
            <WIcon name="keyboard" size="5" />
          </template>
        </WEmptyState>

        <div v-else-if="activeSection === 'about'" class="flex flex-col gap-4">
          <PreferencesSection title="Version">
            <p class="font-mono text-xs text-1">{{ appStore.info?.version ?? "…" }}</p>
          </PreferencesSection>

          <PreferencesSection title="Documentation">
            <WButton size="sm" variant="secondary" @click="appStore.openExternal(DOCS_URL)">
              Open documentation
            </WButton>
          </PreferencesSection>

          <PreferencesSection title="Repository">
            <WButton size="sm" variant="secondary" @click="appStore.openExternal(REPO_URL)">
              Open on GitHub
            </WButton>
          </PreferencesSection>
        </div>
      </div>
    </div>

    <template #footer>
      <WButton variant="secondary" @click="close">Close</WButton>
    </template>
  </WModal>
</template>

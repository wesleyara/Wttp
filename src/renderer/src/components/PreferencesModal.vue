<script setup lang="ts">
import type { MenuAction } from "@shared";

import { useAppStore } from "@renderer/stores/app";
import { useSettingsStore } from "@renderer/stores/settings";
import { useUpdateStore } from "@renderer/stores/update";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import PreferencesSection from "./PreferencesSection.vue";
import WButton from "./WButton.vue";
import WIcon from "./WIcon.vue";
import WModal from "./WModal.vue";
import WSelect from "./WSelect.vue";
import WShortcutInput from "./WShortcutInput.vue";

/**
 * Preferências (EP-08.1-T05, idioma adicionado em EP-08.1-T06) — `WModal size="lg"`
 * com navegação lateral de seções, no lugar do único bloco (pasta raiz de workspaces)
 * que a tela tinha desde EP-06.1.
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
const { t, locale } = useI18n();

type SectionId = "general" | "workspaces" | "updates" | "shortcuts" | "about";

const SECTIONS = computed<{ id: SectionId; label: string; icon: string }[]>(() => [
  { id: "general", label: t("prefs.sections.general"), icon: "sun-moon" },
  { id: "workspaces", label: t("prefs.sections.workspaces"), icon: "folder" },
  { id: "updates", label: t("prefs.sections.updates"), icon: "download" },
  { id: "shortcuts", label: t("prefs.sections.shortcuts"), icon: "keyboard" },
  { id: "about", label: t("prefs.sections.about"), icon: "info" },
]);

const AUTO_UPDATE_OPTIONS = computed(() => [
  { value: "on", label: t("prefs.updates.on") },
  { value: "off", label: t("prefs.updates.off") },
]);

const LANGUAGE_OPTIONS = computed(() => [
  { value: "system", label: t("prefs.language.system") },
  { value: "en", label: t("prefs.language.en") },
  { value: "pt-BR", label: t("prefs.language.ptBR") },
]);

/**
 * EP-11-T03 — nunca alarmante mesmo em erro (falha de rede na checagem é silenciosa
 * por critério de aceite): a pior mensagem daqui é "will retry automatically", nunca
 * um "something went wrong".
 */
const updateStatusLabel = computed<string>(() => {
  const status = updateStore.status;
  switch (status.state) {
    case "idle":
      return t("prefs.updates.status.idle");
    case "checking":
      return t("prefs.updates.status.checking");
    case "available":
      return t("prefs.updates.status.available", { version: status.version });
    case "not-available":
      return t("prefs.updates.status.notAvailable");
    case "downloading":
      return t("prefs.updates.status.downloading", { percent: status.percent });
    case "downloaded":
      return t("prefs.updates.status.downloaded", { version: status.version });
    case "error":
      return t("prefs.updates.status.error");
    case "unsupported":
      return t("prefs.updates.status.unsupported");
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

const THEME_OPTIONS = computed(() => [
  { value: "system", label: t("theme.system") },
  { value: "dark", label: t("theme.dark") },
  { value: "light", label: t("theme.light") },
]);

/** Mesma lista de `MenuAction` em `@shared`, na ordem em que aparecem no menu nativo. */
const SHORTCUT_ACTIONS = computed<{ action: MenuAction; label: string }[]>(() => [
  { action: "request:new", label: t("shortcutActions.requestNew") },
  { action: "request:save", label: t("shortcutActions.requestSave") },
  { action: "request:send", label: t("shortcutActions.requestSend") },
  { action: "tab:close", label: t("shortcutActions.tabClose") },
  { action: "tab:next", label: t("shortcutActions.tabNext") },
  { action: "search:focus", label: t("shortcutActions.searchFocus") },
  { action: "search:quickOpen", label: t("shortcutActions.searchQuickOpen") },
  { action: "git:changes", label: t("shortcutActions.gitChanges") },
  { action: "preferences:open", label: t("shortcutActions.preferencesOpen") },
]);

const shortcutErrors = reactive<Partial<Record<MenuAction, string>>>({});

function onShortcutCapture(action: MenuAction, accelerator: string): void {
  const owner = settings.findAcceleratorOwner(accelerator, action);
  if (owner) {
    const ownerLabel = SHORTCUT_ACTIONS.value.find(entry => entry.action === owner)?.label ?? owner;
    shortcutErrors[action] = t("prefs.shortcuts.alreadyUsedBy", { label: ownerLabel });
    return;
  }
  delete shortcutErrors[action];
  settings.setShortcut(action, accelerator);
}

function onShortcutRestore(action: MenuAction): void {
  delete shortcutErrors[action];
  settings.restoreShortcut(action);
}

const hasCustomShortcuts = computed<boolean>(() => Object.keys(settings.shortcuts).length > 0);

function onResetAllShortcuts(): void {
  for (const key of Object.keys(shortcutErrors)) delete shortcutErrors[key as MenuAction];
  settings.resetShortcuts();
}

const REPO_URL = "https://github.com/wesleyara/Wttp";
const DOCS_SITE_URL = "https://wesleyara.github.io/Wttp";

/** Site publicado no idioma da UI — pt-BR na raiz, en em `/en/` (config do VitePress, EP-08.1-T07). */
const docsUrl = computed<string>(() =>
  locale.value === "pt-BR" ? `${DOCS_SITE_URL}/` : `${DOCS_SITE_URL}/en/`,
);

onMounted(() => void appStore.ping());

function close(): void {
  emit("close");
}

function onSectionKeydown(event: KeyboardEvent): void {
  const sections = SECTIONS.value;
  const index = sections.findIndex(section => section.id === activeSection.value);
  if (index === -1) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeSection.value = sections[(index + 1) % sections.length].id;
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeSection.value = sections[(index - 1 + sections.length) % sections.length].id;
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
  <WModal :open="open" :title="t('status.preferences')" size="lg" @close="close">
    <!-- 28rem é o alvo (altura estável entre abas); o `calc` acompanha o `max-h-[80vh]` do WModal menos header/footer/padding — sem isso, numa janela baixa, esta coluna some do espaço que sobra e as duas overflow-y-auto (esta e a do WModal) rolam juntas. -->
    <div class="flex h-[min(28rem,calc(80vh-8rem))] min-h-0">
      <div
        role="tablist"
        :aria-label="t('prefs.sectionsAria')"
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
          <PreferencesSection
            :title="t('prefs.theme.title')"
            :description="t('prefs.theme.description')"
          >
            <div class="w-40">
              <WSelect
                :model-value="settings.theme"
                :options="THEME_OPTIONS"
                @update:model-value="value => settings.setTheme(value as typeof settings.theme)"
              />
            </div>
          </PreferencesSection>

          <PreferencesSection
            :title="t('prefs.language.title')"
            :description="t('prefs.language.description')"
          >
            <div class="w-48">
              <WSelect
                :model-value="settings.language ?? 'system'"
                :options="LANGUAGE_OPTIONS"
                @update:model-value="
                  value => settings.setLanguage(value as typeof settings.language)
                "
              />
            </div>
          </PreferencesSection>

          <PreferencesSection
            :title="t('prefs.restoreDefaults.title')"
            :description="t('prefs.restoreDefaults.description')"
          >
            <div class="flex flex-col items-start gap-2">
              <WButton size="sm" variant="danger" @click="onRestoreDefaults">
                {{
                  resetConfirming
                    ? t("prefs.restoreDefaults.confirm")
                    : t("prefs.restoreDefaults.button")
                }}
              </WButton>
              <p v-if="resetConfirming" class="font-inter text-xs text-status-5xx">
                {{ t("prefs.restoreDefaults.cannotUndo") }}
              </p>
            </div>
          </PreferencesSection>
        </div>

        <div v-else-if="activeSection === 'workspaces'" class="flex flex-col gap-4">
          <PreferencesSection
            :title="t('prefs.workspaces.title')"
            :description="t('prefs.workspaces.description')"
          >
            <div class="flex items-center gap-2">
              <p
                class="flex-1 truncate rounded-md border border-subtle bg-surface-3 px-2 py-1.5 font-mono text-xs text-1"
              >
                {{ settings.workspacesRootDir ?? t("prefs.workspaces.notSet") }}
              </p>
              <WButton size="sm" variant="secondary" @click="changeWorkspacesRootDir">
                {{ t("prefs.workspaces.change") }}
              </WButton>
            </div>
            <p v-if="settings.workspacesContainerDir" class="font-mono text-[11px] text-faint">
              {{ t("prefs.workspaces.createdIn", { dir: settings.workspacesContainerDir }) }}
            </p>
            <p v-else class="font-inter text-xs text-status-5xx">
              {{ t("prefs.workspaces.mustSet") }}
            </p>
          </PreferencesSection>
        </div>

        <div v-else-if="activeSection === 'updates'" class="flex flex-col gap-4">
          <PreferencesSection
            :title="t('prefs.updates.autoTitle')"
            :description="t('prefs.updates.autoDescription')"
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

          <PreferencesSection :title="t('prefs.updates.statusTitle')">
            <p class="font-inter text-xs text-muted">{{ updateStatusLabel }}</p>
          </PreferencesSection>

          <PreferencesSection
            v-if="!isUnsupportedLinuxPackage"
            :title="t('prefs.updates.checkNowTitle')"
          >
            <WButton
              size="sm"
              variant="secondary"
              :disabled="updateStore.status.state === 'checking'"
              @click="updateStore.check()"
            >
              {{ t("prefs.updates.checkButton") }}
            </WButton>
          </PreferencesSection>
        </div>

        <div v-else-if="activeSection === 'shortcuts'" class="flex flex-col gap-4">
          <div class="flex items-center justify-between gap-4">
            <p class="font-inter text-xs text-muted">{{ t("prefs.shortcuts.clickToRecord") }}</p>
            <WButton
              size="sm"
              variant="secondary"
              :disabled="!hasCustomShortcuts"
              @click="onResetAllShortcuts"
            >
              {{ t("prefs.shortcuts.resetAll") }}
            </WButton>
          </div>

          <PreferencesSection
            v-for="entry in SHORTCUT_ACTIONS"
            :key="entry.action"
            :title="entry.label"
          >
            <div class="flex flex-col gap-1">
              <WShortcutInput
                :model-value="settings.effectiveAccelerator(entry.action) ?? ''"
                :is-custom="entry.action in settings.shortcuts"
                @capture="accelerator => onShortcutCapture(entry.action, accelerator)"
                @restore="onShortcutRestore(entry.action)"
              />
              <p v-if="shortcutErrors[entry.action]" class="font-inter text-xs text-status-5xx">
                {{ shortcutErrors[entry.action] }}
              </p>
            </div>
          </PreferencesSection>
        </div>

        <div v-else-if="activeSection === 'about'" class="flex flex-col gap-4">
          <PreferencesSection :title="t('prefs.about.version')">
            <p class="font-mono text-xs text-1">{{ appStore.info?.version ?? "…" }}</p>
          </PreferencesSection>

          <PreferencesSection :title="t('prefs.about.documentation')">
            <div class="flex flex-wrap gap-2">
              <WButton size="sm" variant="secondary" @click="appStore.openExternal(docsUrl)">
                {{ t("prefs.about.openDocumentation") }}
              </WButton>
              <WButton
                size="sm"
                variant="secondary"
                @click="appStore.openDocsWindow(locale === 'pt-BR' ? 'pt-BR' : 'en')"
              >
                {{ t("prefs.about.openOfflineDocumentation") }}
              </WButton>
            </div>
          </PreferencesSection>

          <PreferencesSection :title="t('prefs.about.repository')">
            <WButton size="sm" variant="secondary" @click="appStore.openExternal(REPO_URL)">
              {{ t("prefs.about.openGithub") }}
            </WButton>
          </PreferencesSection>
        </div>
      </div>
    </div>

    <template #footer>
      <WButton variant="secondary" @click="close">{{ t("common.close") }}</WButton>
    </template>
  </WModal>
</template>

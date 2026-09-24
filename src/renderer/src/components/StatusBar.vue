<script setup lang="ts">
import JwtToolModal from "@renderer/components/JwtToolModal.vue";
import WEnvironmentPicker, {
  type EnvironmentPickerItem,
} from "@renderer/components/WEnvironmentPicker.vue";
import WIcon from "@renderer/components/WIcon.vue";
import { useAppStore } from "@renderer/stores/app";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { useMenuStore } from "@renderer/stores/menu";
import { isRequestTab, useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useSettingsStore } from "@renderer/stores/settings";
import { useUiStore } from "@renderer/stores/ui";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";

const { t, locale } = useI18n();
const appStore = useAppStore();
const settings = useSettingsStore();
const menu = useMenuStore();
const workspace = useWorkspaceStore();
const environment = useEnvironmentStore();
const ui = useUiStore();
const requestTabs = useRequestTabsStore();

/** Resumo dos scripts do último envio da aba ativa (EP-09-T05) — `null` quando não há nada a resumir. */
const scriptSummary = computed(() => {
  const tab = requestTabs.active;
  if (!isRequestTab(tab) || !tab.scriptRun) return null;
  const { assertions, preRequestError } = tab.scriptRun;
  if (preRequestError) return { text: t("status.scriptPreRequestFailed"), failed: true };
  if (assertions.length === 0) return null;
  const failedCount = assertions.filter(a => !a.passed).length;
  return failedCount > 0
    ? {
        text: t("status.scriptTestsFailed", { failed: failedCount, total: assertions.length }),
        failed: true,
      }
    : { text: t("status.scriptTestsPassed", { total: assertions.length }), failed: false };
});

const emit = defineEmits<{
  "open-environment-editor": [];
  "open-preferences": [];
}>();

const NO_ENVIRONMENT = "";

type Theme = "system" | "dark" | "light";

const THEME_ORDER: Theme[] = ["system", "dark", "light"];
const THEME_ICON: Record<Theme, string> = { system: "monitor", dark: "moon", light: "sun" };

/** Heurística de "produção": nome do environment contém "prod" — não há campo dedicado no schema (EP-06-T04). */
function isProduction(name: string): boolean {
  return /prod/i.test(name);
}

const environmentPickerItems = computed<EnvironmentPickerItem[]>(() =>
  environment.items.map(item => ({
    path: item.path,
    label: item.data.name,
    variableCount: item.data.variables?.length ?? 0,
    production: isProduction(item.data.name),
  })),
);

const activeEnvironmentLabel = computed(() => {
  const active = environment.items.find(item => item.path === environment.activePath);
  return active?.data.name ?? t("status.noEnvironment");
});

const environmentTriggerRef = useTemplateRef<HTMLElement>("environmentTrigger");
const environmentPickerOpen = ref(false);
const environmentPickerPosition = ref({ x: 0, bottom: 0 });

function openEnvironmentPicker(): void {
  const rect = environmentTriggerRef.value?.getBoundingClientRect();
  if (!rect) return;
  environmentPickerPosition.value = { x: rect.left, bottom: window.innerHeight - rect.top + 4 };
  environmentPickerOpen.value = true;
}

function onEnvironmentChange(value: string): void {
  environment.setActive(value === NO_ENVIRONMENT ? null : value);
}

function cycleTheme(): void {
  const nextIndex = (THEME_ORDER.indexOf(settings.theme) + 1) % THEME_ORDER.length;
  settings.setTheme(THEME_ORDER[nextIndex]);
}

const jwtToolOpen = ref(false);
</script>

<template>
  <div
    class="flex h-8 shrink-0 items-center gap-3 border-t border-subtle bg-surface-2 px-3 font-inter text-xs text-muted"
  >
    <span>{{ workspace.tree?.data?.name ?? t("status.noWorkspace") }}</span>
    <button
      type="button"
      class="flex items-center text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      :title="t('status.switchWorkspace')"
      @click="workspace.close"
    >
      <WIcon name="arrow-left-right" size="3" />
    </button>
    <span class="text-faint">·</span>
    <button
      ref="environmentTrigger"
      type="button"
      class="-mx-1 flex items-center gap-1 rounded px-1 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      :class="
        environment.items.find(i => i.path === environment.activePath && isProduction(i.data.name))
          ? 'font-semibold text-status-5xx'
          : 'text-1'
      "
      :title="t('status.activeEnvironment')"
      @click="openEnvironmentPicker"
    >
      {{ activeEnvironmentLabel }}
      <WIcon name="chevron-down" size="3" />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      :title="t('status.manageEnvironments')"
      @click="emit('open-environment-editor')"
    >
      <WIcon name="settings" size="3.5" />
      {{ t("status.manage") }}
    </button>
    <span
      v-if="scriptSummary"
      class="flex items-center gap-1"
      :class="scriptSummary.failed ? 'text-status-5xx' : 'text-status-2xx'"
    >
      <WIcon :name="scriptSummary.failed ? 'x' : 'check'" size="3.5" />
      {{ scriptSummary.text }}
    </span>
    <span class="flex-1" role="status" aria-live="polite">{{ menu.statusMessage }}</span>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      :title="t('status.responsePanelPosition', { position: ui.responsePanelPosition })"
      @click="ui.toggleResponsePanelPosition"
    >
      <WIcon
        :name="ui.responsePanelPosition === 'side' ? 'panel-right' : 'panel-bottom'"
        size="3.5"
      />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      :title="t('status.theme', { theme: t(`theme.${settings.theme}`) })"
      @click="cycleTheme"
    >
      <WIcon :name="THEME_ICON[settings.theme]" size="3.5" />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      :title="t('status.jwtTool')"
      @click="jwtToolOpen = true"
    >
      <WIcon name="key" size="3.5" />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      :title="t('status.documentation')"
      @click="appStore.openDocsWindow(locale === 'pt-BR' ? 'pt-BR' : 'en')"
    >
      <WIcon name="book-open" size="3.5" />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      :title="t('status.preferences')"
      @click="emit('open-preferences')"
    >
      <WIcon name="sliders-horizontal" size="3.5" />
    </button>
  </div>

  <WEnvironmentPicker
    :open="environmentPickerOpen"
    :x="environmentPickerPosition.x"
    :bottom="environmentPickerPosition.bottom"
    :items="environmentPickerItems"
    :active-path="environment.activePath ?? NO_ENVIRONMENT"
    @close="environmentPickerOpen = false"
    @select="onEnvironmentChange"
  />

  <JwtToolModal :open="jwtToolOpen" @close="jwtToolOpen = false" />
</template>

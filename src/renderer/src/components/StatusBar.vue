<script setup lang="ts">
import WEnvironmentPicker, {
  type EnvironmentPickerItem,
} from "@renderer/components/WEnvironmentPicker.vue";
import WIcon from "@renderer/components/WIcon.vue";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { useMenuStore } from "@renderer/stores/menu";
import { useSettingsStore } from "@renderer/stores/settings";
import { useUiStore } from "@renderer/stores/ui";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, ref, useTemplateRef } from "vue";

const settings = useSettingsStore();
const menu = useMenuStore();
const workspace = useWorkspaceStore();
const environment = useEnvironmentStore();
const ui = useUiStore();

const emit = defineEmits<{
  "open-environment-editor": [];
  "open-preferences": [];
}>();

const NO_ENVIRONMENT = "";

type Theme = "system" | "dark" | "light";

const THEME_ORDER: Theme[] = ["system", "dark", "light"];
const THEME_ICON: Record<Theme, string> = { system: "monitor", dark: "moon", light: "sun" };
const THEME_LABEL: Record<Theme, string> = { system: "System", dark: "Dark", light: "Light" };

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
  return active?.data.name ?? "No environment";
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
</script>

<template>
  <div
    class="flex h-8 shrink-0 items-center gap-3 border-t border-subtle bg-surface-2 px-3 font-inter text-xs text-muted"
  >
    <span>{{ workspace.tree?.data?.name ?? "No workspace" }}</span>
    <button
      type="button"
      class="flex items-center text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      title="Switch workspace"
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
      title="Active environment"
      @click="openEnvironmentPicker"
    >
      {{ activeEnvironmentLabel }}
      <WIcon name="chevron-down" size="3" />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      title="Manage environments"
      @click="emit('open-environment-editor')"
    >
      <WIcon name="settings" size="3.5" />
      Manage
    </button>
    <span class="flex-1" role="status" aria-live="polite">{{ menu.statusMessage }}</span>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      :title="`Response panel: ${ui.responsePanelPosition}`"
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
      :title="`Theme: ${THEME_LABEL[settings.theme]}`"
      @click="cycleTheme"
    >
      <WIcon :name="THEME_ICON[settings.theme]" size="3.5" />
    </button>
    <button
      type="button"
      class="flex items-center gap-1 text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      title="Preferences"
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
</template>

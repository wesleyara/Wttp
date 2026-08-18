<script setup lang="ts">
import WSelect from "@renderer/components/WSelect.vue";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { useMenuStore } from "@renderer/stores/menu";
import { useSettingsStore } from "@renderer/stores/settings";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed } from "vue";

const settings = useSettingsStore();
const menu = useMenuStore();
const workspace = useWorkspaceStore();
const environment = useEnvironmentStore();

const emit = defineEmits<{
  "open-environment-editor": [];
}>();

const NO_ENVIRONMENT = "";

const themeOptions = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

/** Heurística de "produção": nome do environment contém "prod" — não há campo dedicado no schema (EP-06-T04). */
function isProduction(name: string): boolean {
  return /prod/i.test(name);
}

const environmentOptions = computed(() => [
  { value: NO_ENVIRONMENT, label: "No environment" },
  ...environment.items.map(item => ({ value: item.path, label: item.data.name })),
]);

function environmentValueClass(value: string): string {
  const item = environment.items.find(i => i.path === value);
  if (item && isProduction(item.data.name)) return "font-inter font-semibold text-status-5xx";
  return "font-inter text-1";
}

function onEnvironmentChange(value: string): void {
  environment.setActive(value === NO_ENVIRONMENT ? null : value);
}

function onThemeChange(value: string): void {
  settings.setTheme(value as "dark" | "light" | "system");
}
</script>

<template>
  <div
    class="flex h-8 shrink-0 items-center gap-3 border-t border-subtle bg-surface-2 px-3 font-inter text-xs text-muted"
  >
    <span>{{ workspace.tree?.data?.name ?? "No workspace" }}</span>
    <span class="text-faint">·</span>
    <WSelect
      :model-value="environment.activePath ?? NO_ENVIRONMENT"
      :options="environmentOptions"
      :value-class="environmentValueClass"
      title="Active environment"
      @update:model-value="onEnvironmentChange"
    />
    <button
      type="button"
      class="text-faint hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      title="Manage environments"
      @click="emit('open-environment-editor')"
    >
      Manage
    </button>
    <span class="flex-1" role="status" aria-live="polite">{{ menu.statusMessage }}</span>
    <WSelect
      :model-value="settings.theme"
      :options="themeOptions"
      @update:model-value="onThemeChange"
    />
  </div>
</template>

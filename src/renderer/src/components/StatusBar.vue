<script setup lang="ts">
import WSelect from "@renderer/components/WSelect.vue";
import { useMenuStore } from "@renderer/stores/menu";
import { useSettingsStore } from "@renderer/stores/settings";
import { useWorkspaceStore } from "@renderer/stores/workspace";

// Environment ativo chega no EP-06 — por ora, placeholder fixo.
const settings = useSettingsStore();
const menu = useMenuStore();
const workspace = useWorkspaceStore();

const themeOptions = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

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
    <span>{{ "No environment" }}</span>
    <span class="flex-1" role="status" aria-live="polite">{{ menu.statusMessage }}</span>
    <WSelect
      :model-value="settings.theme"
      :options="themeOptions"
      @update:model-value="onThemeChange"
    />
  </div>
</template>

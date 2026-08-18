<script setup lang="ts">
/**
 * Conteúdo de uma aba de settings de pasta/collection (EP-07.1) — paralelo a
 * `RequestConfigTabs.vue`, mas sem `RequestUrlBar` (uma pasta não tem método/URL) e
 * com uma aba a mais (Overview, os `docs` da pasta) no lugar de Params/Body. `Auth`
 * reusa `AuthConfigEditor` sem alteração — mesmo `AuthConfig`/mesma herança de
 * `RequestConfigTabs`, só que gravando em `folder.yaml` via a aba ativa de
 * `useRequestTabsStore` em vez de numa request.
 */
import type { AuthConfig, KeyValueEntry } from "@shared";

import { useVariablePreview } from "@renderer/composables/useVariablePreview";
import { isFolderTab, useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useVariablesStore } from "@renderer/stores/variables";
import { computed, ref } from "vue";

import type { KeyValueRow } from "./WKeyValueTable.vue";

import AuthConfigEditor from "./AuthConfigEditor.vue";
import WCodeEditor from "./WCodeEditor.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WKeyValueTable from "./WKeyValueTable.vue";
import WTabs from "./WTabs.vue";

const tabsStore = useRequestTabsStore();
const variablesStore = useVariablesStore();

const tab = computed(() => {
  const active = tabsStore.active;
  return isFolderTab(active) ? active : null;
});

const path = computed(() => tab.value?.path ?? "");
const selfLabel = computed(() => (tab.value?.isCollection ? "This collection" : "This folder"));

const activeTab = ref("overview");

const docs = computed<string>({
  get: () => tab.value?.docs ?? "",
  set: value => {
    if (!tab.value) return;
    tab.value.docs = value;
    tabsStore.markActiveDirty();
  },
});
const { unresolved: docsUnresolved, tooltips: docsTooltips } = useVariablePreview(docs, path);

const auth = computed<AuthConfig>({
  get: () => tab.value?.auth ?? { type: "inherit" },
  set: value => {
    if (!tab.value) return;
    tab.value.auth = value;
    tabsStore.markActiveDirty();
  },
});

const variableRows = computed<KeyValueRow[]>({
  get: () => (tab.value?.variables ?? []).map(v => ({ ...v, description: v.description ?? "" })),
  set: rows => {
    if (!tab.value) return;
    tab.value.variables = rows as KeyValueEntry[];
    tabsStore.markActiveDirty();
  },
});
const variablesText = computed(() => variableRows.value.map(row => row.value).join("\n"));
const { unresolved: variablesUnresolved, tooltips: variablesTooltips } = useVariablePreview(
  variablesText,
  path,
);
const variableNames = computed(() => variablesStore.variableNamesFor(path.value));

function countActive(rows: { enabled: boolean; name: string }[]): number {
  return rows.filter(row => row.enabled && row.name !== "").length;
}

const tabs = computed(() => [
  { value: "overview", label: "Overview" },
  { value: "auth", label: "Auth" },
  { value: "scripts", label: "Scripts" },
  { value: "variables", label: "Variables", count: countActive(variableRows.value) },
]);
</script>

<template>
  <div v-if="tab" class="flex flex-col">
    <div class="mb-2 flex h-8 shrink-0 items-center gap-2">
      <WIcon name="folder" size="4" class="text-faint" />
      <p class="truncate font-barlow text-sm font-semibold text-1">{{ tab.title }}</p>
      <span
        class="shrink-0 rounded-full border border-subtle bg-surface-2 px-2 py-0.5 font-inter text-xs text-muted"
      >
        {{ tab.isCollection ? "Collection" : "Folder" }}
      </span>
    </div>

    <WTabs v-model="activeTab" :tabs="tabs" />

    <div v-if="activeTab === 'overview'" class="h-48 pt-2">
      <WCodeEditor
        v-model="docs"
        language="text"
        placeholder="Document this folder…"
        :unresolved-variables="docsUnresolved"
        :variable-tooltips="docsTooltips"
        :variable-names="variableNames"
      />
    </div>

    <div v-else-if="activeTab === 'auth'">
      <AuthConfigEditor v-model="auth" :path="path" :self-label="selfLabel" />
    </div>

    <div v-else-if="activeTab === 'scripts'" class="pt-2">
      <WEmptyState
        title="No scripts"
        description="Pre-request and test scripts are coming in a future release."
      />
    </div>

    <div v-else-if="activeTab === 'variables'" class="pt-2">
      <WKeyValueTable
        v-model="variableRows"
        :unresolved-variables="variablesUnresolved"
        :variable-tooltips="variablesTooltips"
        :variable-names="variableNames"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { parseJsonDocument } from "@renderer/lib/jsonParse";
import { displayPath, type Json, type TreeRow } from "@renderer/lib/jsonTree";
import { useToastStore } from "@renderer/stores/toast";
import { computed, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";

import JsonTreeView from "./JsonTreeView.vue";
import WButton from "./WButton.vue";
import WCodeEditor from "./WCodeEditor.vue";
import WContextMenu, { type ContextMenuItem } from "./WContextMenu.vue";
import WEmptyState from "./WEmptyState.vue";
import WModal from "./WModal.vue";
import WTabs from "./WTabs.vue";

/**
 * Ferramenta avulsa (ClickLocal #163): cola um JSON e explora como árvore ou texto
 * formatado, sem depender de uma request. Tudo roda no renderer — parse puro, sem IPC.
 * Reaproveita a `JsonTreeView` (virtualizada) da árvore de resposta.
 */
defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const toast = useToastStore();

const input = ref("");
const activeTab = ref<"tree" | "formatted">("tree");

const parsed = computed(() => (input.value.trim() === "" ? null : parseJsonDocument(input.value)));
const data = computed<Json | undefined>(() => (parsed.value?.ok ? parsed.value.data : undefined));
const errorText = computed(() => {
  const result = parsed.value;
  if (!result || result.ok) return null;
  return result.line !== null
    ? t("jsonViewer.errorAt", { line: result.line, column: result.column, message: result.message })
    : t("jsonViewer.error", { message: result.message });
});
const formatted = computed(() =>
  data.value === undefined ? "" : JSON.stringify(data.value, null, 2),
);

function format(): void {
  if (data.value !== undefined) input.value = formatted.value;
}

function minify(): void {
  if (data.value !== undefined) input.value = JSON.stringify(data.value);
}

async function copy(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  toast.push(t("jsonViewer.copied"), "success");
}

const menu = shallowRef({ open: false, x: 0, y: 0, row: null as TreeRow | null });
const menuItems = computed<ContextMenuItem[]>(() => {
  const row = menu.value.row;
  if (!row) return [];
  return [
    {
      label: t("jsonViewer.copyValue"),
      icon: "copy",
      action: () =>
        void copy(
          typeof row.value === "string" ? row.value : (JSON.stringify(row.value, null, 2) ?? ""),
        ),
    },
    {
      label: t("jsonViewer.copyPath"),
      icon: "copy",
      action: () => void copy(displayPath(row.path)),
    },
  ];
});

function onNodeMenu(row: TreeRow, event: MouseEvent): void {
  menu.value = { open: true, x: event.clientX, y: event.clientY, row };
}
</script>

<template>
  <WModal :open="open" :title="t('jsonViewer.title')" size="xl" @close="emit('close')">
    <div class="grid grid-cols-2 gap-4">
      <div class="flex h-[28rem] flex-col gap-2">
        <div class="flex items-center gap-2">
          <WButton size="sm" :disabled="data === undefined" @click="format">
            {{ t("jsonViewer.format") }}
          </WButton>
          <WButton size="sm" :disabled="data === undefined" @click="minify">
            {{ t("jsonViewer.minify") }}
          </WButton>
        </div>
        <div class="min-h-0 flex-1" data-testid="json-viewer-input">
          <WCodeEditor
            v-model="input"
            language="json"
            :placeholder="t('jsonViewer.placeholder')"
            line-wrap
          />
        </div>
      </div>
      <div class="flex h-[28rem] flex-col gap-2">
        <WTabs
          v-model="activeTab"
          :tabs="[
            { value: 'tree', label: t('jsonViewer.tree') },
            { value: 'formatted', label: t('jsonViewer.formatted') },
          ]"
        />
        <p
          v-if="errorText"
          class="font-inter text-xs text-status-5xx"
          data-testid="json-viewer-error"
        >
          {{ errorText }}
        </p>
        <div v-else-if="data === undefined" class="min-h-0 flex-1">
          <WEmptyState :title="t('jsonViewer.empty')" />
        </div>
        <template v-else>
          <div v-if="activeTab === 'tree'" class="min-h-0 flex-1">
            <JsonTreeView :data="data" @node-menu="onNodeMenu" />
          </div>
          <div v-else class="flex min-h-0 flex-1 flex-col gap-2">
            <div class="min-h-0 flex-1">
              <WCodeEditor :model-value="formatted" language="json" read-only line-wrap />
            </div>
            <div>
              <WButton size="sm" @click="copy(formatted)">{{ t("jsonViewer.copy") }}</WButton>
            </div>
          </div>
        </template>
      </div>
    </div>
  </WModal>

  <WContextMenu
    :open="menu.open"
    :x="menu.x"
    :y="menu.y"
    :items="menuItems"
    @close="menu = { ...menu, open: false }"
  />
</template>

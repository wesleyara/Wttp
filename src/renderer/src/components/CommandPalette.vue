<script setup lang="ts">
import type { WorkspaceNode } from "@shared";

import WInput from "@renderer/components/WInput.vue";
import WMethodBadge from "@renderer/components/WMethodBadge.vue";
import WModal from "@renderer/components/WModal.vue";
import { fuzzySearch } from "@renderer/lib/fuzzyMatch";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const workspace = useWorkspaceStore();
const tabs = useRequestTabsStore();

interface RequestEntry {
  path: string;
  name: string;
  method: string;
  url: string;
}

function collectRequests(nodes: WorkspaceNode[] | undefined, out: RequestEntry[]): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.kind === "request" && node.data) {
      out.push({ path: node.path, name: node.name, method: node.data.method, url: node.data.url });
    } else if (node.kind === "folder") {
      collectRequests(node.children, out);
    }
  }
}

const allRequests = computed<RequestEntry[]>(() => {
  const out: RequestEntry[] = [];
  collectRequests(workspace.tree?.children, out);
  return out;
});

const query = ref("");
const activeIndex = ref(0);

const results = computed(() => fuzzySearch(query.value, allRequests.value, entry => entry));

watch(results, () => (activeIndex.value = 0));

watch(
  () => props.open,
  async isOpen => {
    if (!isOpen) return;
    query.value = "";
    activeIndex.value = 0;
    // `WModal` foca seu próprio painel de forma assíncrona ao abrir (`nextTick` interno)
    // — um `requestAnimationFrame` aqui roda depois disso, então vence a corrida e o
    // campo de busca fica com o foco, não o painel. `$el` não serve porque a raiz do
    // `WModal` teleporta para `document.body` — o próprio componente não referencia
    // o DOM teleportado.
    await nextTick();
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('[role="dialog"] input')?.focus();
    });
  },
);

function openResult(entry: RequestEntry, pinned: boolean): void {
  void (pinned ? tabs.openPinned(entry.path) : tabs.openPreview(entry.path));
  emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, results.value.length - 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const entry = results.value[activeIndex.value];
    if (entry) openResult(entry, event.ctrlKey || event.metaKey);
  }
}
</script>

<template>
  <WModal :open="open" :title="t('command.title')" @close="emit('close')">
    <div class="flex flex-col gap-2" @keydown="onKeydown">
      <WInput v-model="query" :placeholder="t('command.placeholder')" />

      <p v-if="query.trim() && results.length === 0" class="p-2 font-inter text-sm text-muted">
        {{ t("command.noMatches") }}
      </p>

      <ul v-else class="flex flex-col">
        <li
          v-for="(entry, index) in results"
          :key="entry.path"
          class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5"
          :class="
            index === activeIndex ? 'bg-surface-3 text-1' : 'text-muted hover:bg-surface-3/50'
          "
          @click="openResult(entry, false)"
          @mouseenter="activeIndex = index"
        >
          <WMethodBadge :method="entry.method" class="w-10 shrink-0 text-[11px]" />
          <span class="truncate font-inter text-sm">{{ entry.name }}</span>
          <span class="ml-auto truncate font-mono text-[11px] text-faint">{{ entry.path }}</span>
        </li>
      </ul>
    </div>
  </WModal>
</template>

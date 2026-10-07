<script setup lang="ts">
import { useFlowsStore } from "@renderer/stores/flows";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WContextMenu, { type ContextMenuItem } from "./WContextMenu.vue";
import WIcon from "./WIcon.vue";
import WModal from "./WModal.vue";

/**
 * Flows na barra lateral: cada `flows/*.flow.yaml` é um item próprio, fora da árvore de
 * collections (que nunca contém flows). Clicar abre a aba do flow.
 */

const { t } = useI18n();
const flows = useFlowsStore();
const tabs = useRequestTabsStore();

const collapsed = ref(false);
const menu = ref<{ path: string; x: number; y: number } | null>(null);
const deleting = ref<string | null>(null);

const deletingName = computed(() => flows.find(deleting.value ?? "")?.name ?? "");

const menuItems = computed<ContextMenuItem[]>(() => {
  const target = menu.value;
  if (!target) return [];
  return [
    { label: t("flows.open"), icon: "workflow", action: () => flows.open(target.path) },
    {
      label: t("contextMenu.delete"),
      icon: "trash-2",
      separatorBefore: true,
      action: () => (deleting.value = target.path),
    },
  ];
});

function onContextMenu(path: string, event: MouseEvent): void {
  event.preventDefault();
  menu.value = { path, x: event.clientX, y: event.clientY };
}

async function confirmDelete(): Promise<void> {
  const path = deleting.value;
  deleting.value = null;
  if (path) await flows.remove(path);
}
</script>

<template>
  <section
    v-if="flows.flows.length > 0"
    class="flex max-h-[40%] shrink-0 flex-col border-t border-subtle"
    data-testid="flows-section"
  >
    <button
      type="button"
      class="flex h-7 shrink-0 items-center gap-1 px-2 text-left font-inter text-xs font-semibold text-muted hover:text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
    >
      <WIcon :name="collapsed ? 'chevron-right' : 'chevron-down'" size="3" />
      {{ t("flows.section") }}
      <span class="font-normal text-faint">{{ flows.flows.length }}</span>
    </button>
    <ul v-if="!collapsed" class="min-h-0 overflow-y-auto pb-1">
      <li v-for="flow in flows.flows" :key="flow.path">
        <button
          type="button"
          class="flex h-7 w-full items-center gap-2 px-3 text-left font-inter text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          :class="
            tabs.active?.id === `__flow__:${flow.path}`
              ? 'bg-surface-3 text-1'
              : 'text-muted hover:bg-surface-3/50'
          "
          data-testid="flow-item"
          @click="flows.open(flow.path)"
          @contextmenu="onContextMenu(flow.path, $event)"
        >
          <WIcon name="workflow" class="text-faint" />
          <span class="min-w-0 flex-1 truncate">{{ flow.name }}</span>
          <span
            v-if="flows.isDirty(flow.path)"
            class="size-1.5 shrink-0 rounded-full bg-accent"
            aria-hidden="true"
          />
          <WIcon
            v-if="!flow.data"
            name="triangle-alert"
            class="text-status-4xx"
            :title="t('flows.invalid')"
          />
        </button>
      </li>
    </ul>

    <WContextMenu
      :open="menu !== null"
      :x="menu?.x ?? 0"
      :y="menu?.y ?? 0"
      :items="menuItems"
      @close="menu = null"
    />
    <WModal :open="deleting !== null" :title="t('flows.deleteTitle')" @close="deleting = null">
      <p class="font-inter text-sm text-1">{{ t("flows.deleteBody", { name: deletingName }) }}</p>
      <template #footer>
        <WButton variant="ghost" @click="deleting = null">{{ t("common.cancel") }}</WButton>
        <WButton variant="danger" data-testid="flow-delete-confirm" @click="confirmDelete">
          {{ t("common.delete") }}
        </WButton>
      </template>
    </WModal>
  </section>
</template>

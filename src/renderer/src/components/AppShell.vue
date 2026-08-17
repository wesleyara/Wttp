<script setup lang="ts">
import type { WorkspaceNode } from "@shared";

import RequestConfigTabs from "@renderer/components/RequestConfigTabs.vue";
import RequestTabsBar from "@renderer/components/RequestTabsBar.vue";
import RequestUrlBar from "@renderer/components/RequestUrlBar.vue";
import ResponsePanel from "@renderer/components/ResponsePanel.vue";
import StatusBar from "@renderer/components/StatusBar.vue";
import WButton from "@renderer/components/WButton.vue";
import WContextMenu, { type ContextMenuItem } from "@renderer/components/WContextMenu.vue";
import WEmptyState from "@renderer/components/WEmptyState.vue";
import WInput from "@renderer/components/WInput.vue";
import WModal from "@renderer/components/WModal.vue";
import WorkspaceLanding from "@renderer/components/WorkspaceLanding.vue";
import WSplitPane from "@renderer/components/WSplitPane.vue";
import WTree from "@renderer/components/WTree.vue";
import { useMenuStore } from "@renderer/stores/menu";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useTreeStore } from "@renderer/stores/tree";
import { useUiStore } from "@renderer/stores/ui";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, onMounted, onUnmounted } from "vue";

// Esqueleto definitivo do app (EP-02-T04): sidebar de collections, área central de
// abas de request e painel de resposta (EP-05-T05).
const ui = useUiStore();
const menu = useMenuStore();
const workspace = useWorkspaceStore();
const tree = useTreeStore();
const requestTabs = useRequestTabsStore();

function onActivate(node: WorkspaceNode, mode: "preview" | "pinned"): void {
  if (node.kind !== "request") return;
  void (mode === "preview"
    ? requestTabs.openPreview(node.path)
    : requestTabs.openPinned(node.path));
}

function onTabNext(): void {
  const ids = requestTabs.tabs.map(tab => tab.id);
  if (ids.length === 0) return;
  const currentIndex = ids.indexOf(requestTabs.activeId ?? "");
  requestTabs.activate(ids[(currentIndex + 1) % ids.length]);
}

const contextMenuItems = computed<ContextMenuItem[]>(() => {
  const target = tree.contextMenuTarget;
  if (!target) return [];
  const { node } = target;
  const items: ContextMenuItem[] = [];

  if (node.kind === "folder") {
    items.push(
      { label: "New request", action: () => void tree.createRequest(node.path) },
      { label: "New folder", action: () => void tree.createFolder(node.path) },
    );
  }
  items.push(
    { label: "Rename", action: () => tree.startRename(node.path) },
    { label: "Duplicate", action: () => void tree.duplicate(node.path) },
    { label: "Reveal in file explorer", action: () => void tree.reveal(node.path) },
    {
      label: "Delete",
      danger: true,
      separatorBefore: true,
      action: () => tree.requestDelete(node),
    },
  );
  return items;
});

let stopListeningToMenu: (() => void) | null = null;

onMounted(() => {
  void ui.load();
  void workspace.init();
  stopListeningToMenu = menu.listen({
    "request:new": () => void tree.createRequest(),
    "request:save": () => void requestTabs.saveActive(),
    "tab:close": () => {
      if (requestTabs.activeId) requestTabs.requestClose(requestTabs.activeId);
    },
    "tab:next": onTabNext,
  });
});

onUnmounted(() => stopListeningToMenu?.());
</script>

<template>
  <div class="flex h-screen flex-col bg-surface-1">
    <div class="flex h-8 shrink-0 items-center justify-end border-b border-subtle px-2">
      <WButton size="sm" variant="ghost" @click="ui.toggleResponsePanelPosition">
        Response panel: {{ ui.responsePanelPosition }}
      </WButton>
    </div>
    <div class="min-h-0 flex-1">
      <WorkspaceLanding v-if="!workspace.ready" />
      <WSplitPane
        v-else-if="ui.loaded"
        direction="horizontal"
        :model-value="ui.sidebarWidth"
        :min="200"
        :max="480"
        @update:model-value="ui.setSidebarWidth"
      >
        <template #first>
          <aside class="flex h-full flex-col bg-surface-2">
            <div class="flex shrink-0 items-center gap-1 border-b border-subtle p-2">
              <WInput v-model="tree.filterText" placeholder="Filter…" class="flex-1" />
              <WButton size="sm" variant="ghost" title="New request" @click="tree.createRequest()">
                +Req
              </WButton>
              <WButton size="sm" variant="ghost" title="New folder" @click="tree.createFolder()">
                +Dir
              </WButton>
            </div>
            <div class="min-h-0 flex-1">
              <WEmptyState
                v-if="!workspace.tree || workspace.tree.children.length === 0"
                title="No collections yet"
                description="Create your first request."
              >
                <template #action>
                  <WButton variant="primary" size="sm" @click="tree.createRequest()">
                    New request
                  </WButton>
                </template>
              </WEmptyState>
              <WTree
                v-else
                :nodes="workspace.tree.children"
                :expanded-paths="tree.expandedPaths"
                :selected-path="tree.selectedPath"
                :filter-text="tree.filterText"
                :editing-path="tree.editingPath"
                @update:expanded-paths="tree.setExpandedPaths"
                @update:selected-path="tree.selectedPath = $event"
                @activate="onActivate"
                @contextmenu="tree.openContextMenu"
                @rename="tree.confirmRename"
                @cancel-rename="tree.cancelRename"
                @shortcut="tree.onShortcut"
                @move="tree.moveInto"
              />
            </div>
          </aside>
        </template>
        <template #second>
          <WSplitPane
            :key="ui.responsePanelPosition"
            :direction="ui.responsePanelPosition === 'side' ? 'horizontal' : 'vertical'"
            sized-pane="second"
            :model-value="ui.responsePanelSize"
            :min="240"
            @update:model-value="ui.setResponsePanelSize"
          >
            <template #first>
              <main class="flex h-full flex-col bg-surface-1">
                <WEmptyState
                  v-if="requestTabs.tabs.length === 0"
                  title="No request open"
                  description="Select or create a request."
                />
                <template v-else>
                  <RequestTabsBar />
                  <div class="min-h-0 flex-1 overflow-y-auto p-3">
                    <RequestUrlBar />
                    <RequestConfigTabs class="mt-3" />
                  </div>
                </template>
              </main>
            </template>
            <template #second>
              <section class="flex h-full flex-col bg-surface-2">
                <ResponsePanel v-if="requestTabs.active" />
                <WEmptyState
                  v-else
                  title="No response yet"
                  description="Send a request to see a response."
                />
              </section>
            </template>
          </WSplitPane>
        </template>
      </WSplitPane>
    </div>
    <StatusBar />

    <WContextMenu
      :open="tree.contextMenuTarget !== null"
      :x="tree.contextMenuTarget?.x ?? 0"
      :y="tree.contextMenuTarget?.y ?? 0"
      :items="contextMenuItems"
      @close="tree.closeContextMenu"
    />

    <WModal
      :open="requestTabs.closeConfirmTab !== null"
      title="Unsaved changes"
      @close="requestTabs.cancelClose"
    >
      <p v-if="requestTabs.closeConfirmTab" class="font-inter text-sm text-1">
        "{{ requestTabs.closeConfirmTab.title }}" has unsaved changes. Save before closing?
      </p>
      <template #footer>
        <WButton variant="ghost" @click="requestTabs.cancelClose">Cancel</WButton>
        <WButton variant="danger" @click="requestTabs.confirmCloseDiscard">Discard</WButton>
        <WButton variant="primary" @click="requestTabs.confirmCloseSave">Save</WButton>
      </template>
    </WModal>

    <WModal :open="tree.deleteTarget !== null" title="Delete" @close="tree.cancelDelete">
      <p v-if="tree.deleteTarget" class="font-inter text-sm text-1">
        Delete "{{ tree.deleteTarget.node.name }}"?
        <template v-if="tree.deleteTarget.descendantCount > 0">
          This also removes {{ tree.deleteTarget.descendantCount }}
          {{ tree.deleteTarget.descendantCount === 1 ? "item" : "items" }} inside it.
        </template>
        It moves to the system trash.
      </p>
      <template #footer>
        <WButton variant="ghost" @click="tree.cancelDelete">Cancel</WButton>
        <WButton variant="danger" @click="tree.confirmDelete">Delete</WButton>
      </template>
    </WModal>
  </div>
</template>

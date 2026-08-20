<script setup lang="ts">
import type { WorkspaceNode } from "@shared";

import CommandPalette from "@renderer/components/CommandPalette.vue";
import EnvironmentEditorModal from "@renderer/components/EnvironmentEditorModal.vue";
import FolderConfigTabs from "@renderer/components/FolderConfigTabs.vue";
import ImportModal from "@renderer/components/ImportModal.vue";
import MoveCopyModal from "@renderer/components/MoveCopyModal.vue";
import PreferencesModal from "@renderer/components/PreferencesModal.vue";
import RequestConfigTabs from "@renderer/components/RequestConfigTabs.vue";
import RequestTabsBar from "@renderer/components/RequestTabsBar.vue";
import RequestUrlBar from "@renderer/components/RequestUrlBar.vue";
import ResponsePanel from "@renderer/components/ResponsePanel.vue";
import StatusBar from "@renderer/components/StatusBar.vue";
import WButton from "@renderer/components/WButton.vue";
import WContextMenu, { type ContextMenuItem } from "@renderer/components/WContextMenu.vue";
import WEmptyState from "@renderer/components/WEmptyState.vue";
import WIcon from "@renderer/components/WIcon.vue";
import WInput from "@renderer/components/WInput.vue";
import WModal from "@renderer/components/WModal.vue";
import WorkspaceLanding from "@renderer/components/WorkspaceLanding.vue";
import WSplitPane from "@renderer/components/WSplitPane.vue";
import WToast from "@renderer/components/WToast.vue";
import WTree from "@renderer/components/WTree.vue";
import { useImportStore } from "@renderer/stores/import";
import { useMenuStore } from "@renderer/stores/menu";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useTreeStore } from "@renderer/stores/tree";
import { useUiStore } from "@renderer/stores/ui";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from "vue";

// Esqueleto definitivo do app (EP-02-T04): sidebar de collections, área central de
// abas de request e painel de resposta (EP-05-T05).
const ui = useUiStore();
const menu = useMenuStore();
const workspace = useWorkspaceStore();
const tree = useTreeStore();
const requestTabs = useRequestTabsStore();
const importStore = useImportStore();

const importModalOpen = ref(false);

function openImportIntoWorkspace(): void {
  if (!workspace.root) return;
  importStore.startIntoWorkspace(workspace.root);
  importModalOpen.value = true;
}

async function onCloseImportModal(): Promise<void> {
  importModalOpen.value = false;
  await workspace.refreshTree();
}

function onActivate(node: WorkspaceNode, mode: "preview" | "pinned"): void {
  if (node.kind === "request") {
    void (mode === "preview"
      ? requestTabs.openPreview(node.path)
      : requestTabs.openPinned(node.path));
  } else if (node.kind === "folder") {
    // Pasta/collection: sem noção de preview, um clique já abre/ativa a aba definitiva (EP-07.1).
    void requestTabs.openFolderTab(node.path);
  }
}

function onTabNext(): void {
  const ids = requestTabs.tabs.map(tab => tab.id);
  if (ids.length === 0) return;
  const currentIndex = ids.indexOf(requestTabs.activeId ?? "");
  requestTabs.activate(ids[(currentIndex + 1) % ids.length]);
}

const paletteOpen = ref(false);
const environmentEditorOpen = ref(false);
const preferencesOpen = ref(false);

/** Menu "+" da toolbar da árvore (EP-07.1) — substitui os dois botões separados de criar. */
const createMenuOpen = ref(false);
const createButtonRef = useTemplateRef<HTMLElement>("createButton");
const createMenuPosition = ref({ x: 0, y: 0 });

function openCreateMenu(): void {
  const rect = createButtonRef.value?.getBoundingClientRect();
  if (rect) createMenuPosition.value = { x: rect.left, y: rect.bottom + 4 };
  createMenuOpen.value = true;
}

const createMenuItems = computed<ContextMenuItem[]>(() => [
  { label: "New collection", icon: "layers", action: () => void tree.createCollection() },
  { label: "New folder", icon: "folder-plus", action: () => void tree.createFolder() },
  { label: "New request", icon: "file-plus", action: () => void tree.createRequest() },
  { label: "Import", icon: "import", separatorBefore: true, action: openImportIntoWorkspace },
]);

const contextMenuItems = computed<ContextMenuItem[]>(() => {
  const target = tree.contextMenuTarget;
  if (!target) return [];
  const { node } = target;
  const items: ContextMenuItem[] = [];

  if (node.kind === "folder") {
    items.push(
      { label: "New request", icon: "file-plus", action: () => void tree.createRequest(node.path) },
      { label: "New folder", icon: "folder-plus", action: () => void tree.createFolder(node.path) },
      {
        label: "Settings",
        icon: "settings",
        action: () => void requestTabs.openFolderTab(node.path),
      },
    );
  }
  items.push(
    { label: "Rename", icon: "pencil", action: () => tree.startRename(node.path) },
    { label: "Duplicate", icon: "copy", action: () => void tree.duplicate(node.path) },
    { label: "Move to…", icon: "folder-input", action: () => tree.openMoveCopy(node, "move") },
    { label: "Copy to…", icon: "copy-plus", action: () => tree.openMoveCopy(node, "copy") },
    {
      label: "Reveal in file explorer",
      icon: "folder-open",
      action: () => void tree.reveal(node.path),
    },
    {
      label: "Delete",
      icon: "trash-2",
      danger: true,
      separatorBefore: true,
      action: () => tree.requestDelete(node),
    },
  );
  return items;
});

let stopListeningToMenu: (() => void) | null = null;

/**
 * Fechamento do app (EP-08.1-T01) — sem isso, a última mudança de sessão (aba aberta/
 * fechada/reordenada, ou o rascunho de uma aba suja) se perde nos 300 ms/500 ms de
 * debounce de `patchUiState`/`flushDrafts`, que nunca chegam a rodar.
 */
function flushSessionOnUnload(): void {
  workspace.flushUiState();
  requestTabs.flushDrafts();
}

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
    "search:quickOpen": () => (paletteOpen.value = true),
    "preferences:open": () => (preferencesOpen.value = true),
  });
  window.addEventListener("beforeunload", flushSessionOnUnload);
});

onUnmounted(() => {
  stopListeningToMenu?.();
  window.removeEventListener("beforeunload", flushSessionOnUnload);
});
</script>

<template>
  <div class="flex h-screen flex-col bg-surface-1">
    <div class="min-h-0 flex-1">
      <WorkspaceLanding v-if="!workspace.ready" @open-preferences="preferencesOpen = true" />
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
              <span ref="createButton" class="inline-flex">
                <WButton size="sm" variant="ghost" title="New…" @click="openCreateMenu">
                  <WIcon name="plus" />
                </WButton>
              </span>
            </div>
            <div class="min-h-0 flex-1">
              <WEmptyState
                v-if="!workspace.tree || workspace.tree.children.length === 0"
                title="No collections yet"
                description="Create your first request."
              >
                <template #icon>
                  <WIcon name="folder-open" size="5" />
                </template>
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
                :selected-paths="tree.selectedPaths"
                :filter-text="tree.filterText"
                :editing-path="tree.editingPath"
                @update:expanded-paths="tree.setExpandedPaths"
                @update:selected-path="tree.selectedPath = $event"
                @update:selected-paths="tree.selectedPaths = $event"
                @activate="onActivate"
                @contextmenu="tree.openContextMenu"
                @rename="tree.confirmRename"
                @cancel-rename="tree.cancelRename"
                @shortcut="tree.onShortcut"
                @move="tree.moveInto"
                @move-many="tree.moveManyInto"
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
                  title="Nothing open"
                  description="Select or create a request, folder or collection."
                >
                  <template #icon>
                    <WIcon name="send" size="5" />
                  </template>
                </WEmptyState>
                <template v-else>
                  <RequestTabsBar />
                  <div class="min-h-0 flex-1 overflow-y-auto p-3">
                    <template v-if="requestTabs.active?.kind === 'request'">
                      <RequestUrlBar />
                      <RequestConfigTabs class="mt-3" />
                    </template>
                    <FolderConfigTabs v-else-if="requestTabs.active?.kind === 'folder'" />
                  </div>
                </template>
              </main>
            </template>
            <template #second>
              <section class="flex h-full flex-col bg-surface-2">
                <ResponsePanel v-if="requestTabs.active?.kind === 'request'" />
                <WEmptyState
                  v-else
                  title="No response yet"
                  description="Send a request to see a response."
                >
                  <template #icon>
                    <WIcon name="inbox" size="5" />
                  </template>
                </WEmptyState>
              </section>
            </template>
          </WSplitPane>
        </template>
      </WSplitPane>
    </div>
    <StatusBar
      @open-environment-editor="environmentEditorOpen = true"
      @open-preferences="preferencesOpen = true"
    />

    <CommandPalette :open="paletteOpen" @close="paletteOpen = false" />

    <EnvironmentEditorModal :open="environmentEditorOpen" @close="environmentEditorOpen = false" />

    <PreferencesModal :open="preferencesOpen" @close="preferencesOpen = false" />

    <ImportModal :open="importModalOpen" @close="onCloseImportModal" />

    <MoveCopyModal />

    <WToast />

    <WContextMenu
      :open="tree.contextMenuTarget !== null"
      :x="tree.contextMenuTarget?.x ?? 0"
      :y="tree.contextMenuTarget?.y ?? 0"
      :items="contextMenuItems"
      @close="tree.closeContextMenu"
    />

    <WContextMenu
      :open="createMenuOpen"
      :x="createMenuPosition.x"
      :y="createMenuPosition.y"
      :items="createMenuItems"
      @close="createMenuOpen = false"
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

    <WModal
      :open="requestTabs.unresolvedSendId !== null"
      title="Unresolved variable"
      @close="requestTabs.cancelSendUnresolved"
    >
      <p v-if="requestTabs.unresolvedSendTab" class="font-inter text-sm text-1">
        "{{ requestTabs.unresolvedSendTab.title }}" has unresolved variable{{
          requestTabs.unresolvedSendNames.length > 1 ? "s" : ""
        }}:
        <span class="font-mono text-status-4xx">{{
          requestTabs.unresolvedSendNames.join(", ")
        }}</span
        >. Send anyway?
      </p>
      <template #footer>
        <WButton variant="ghost" @click="requestTabs.cancelSendUnresolved">Cancel</WButton>
        <WButton variant="primary" @click="requestTabs.confirmSendUnresolved">Send anyway</WButton>
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

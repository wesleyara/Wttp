<script setup lang="ts">
import type { WorkspaceNode } from "@shared";

import CommandPalette from "@renderer/components/CommandPalette.vue";
import EnvironmentsPanel from "@renderer/components/EnvironmentsPanel.vue";
import FolderConfigTabs from "@renderer/components/FolderConfigTabs.vue";
import ImportModal from "@renderer/components/ImportModal.vue";
import MoveCopyModal from "@renderer/components/MoveCopyModal.vue";
import PreferencesModal from "@renderer/components/PreferencesModal.vue";
import RequestConfigTabs from "@renderer/components/RequestConfigTabs.vue";
import RequestTabsBar from "@renderer/components/RequestTabsBar.vue";
import RequestUrlBar from "@renderer/components/RequestUrlBar.vue";
import ResponsePanel from "@renderer/components/ResponsePanel.vue";
import RunnerPanel from "@renderer/components/RunnerPanel.vue";
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
import { useRunnerStore } from "@renderer/stores/runner";
import { useTreeStore } from "@renderer/stores/tree";
import { useUiStore } from "@renderer/stores/ui";
import { useUpdateStore } from "@renderer/stores/update";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";

// Esqueleto definitivo do app (EP-02-T04): sidebar de collections, área central de
// abas de request e painel de resposta (EP-05-T05).
const { t } = useI18n();
const ui = useUiStore();
const menu = useMenuStore();
const workspace = useWorkspaceStore();
const tree = useTreeStore();
const requestTabs = useRequestTabsStore();
const runner = useRunnerStore();
const importStore = useImportStore();
const updateStore = useUpdateStore();

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
  {
    label: t("createMenu.newCollection"),
    icon: "layers",
    action: () => void tree.createCollection(),
  },
  { label: t("createMenu.newFolder"), icon: "folder-plus", action: () => void tree.createFolder() },
  { label: t("createMenu.newRequest"), icon: "file-plus", action: () => void tree.createRequest() },
  {
    label: t("createMenu.import"),
    icon: "import",
    separatorBefore: true,
    action: openImportIntoWorkspace,
  },
]);

const contextMenuItems = computed<ContextMenuItem[]>(() => {
  const target = tree.contextMenuTarget;
  if (!target) return [];
  const { node } = target;
  const items: ContextMenuItem[] = [];

  if (node.kind === "folder") {
    items.push(
      {
        label: t("contextMenu.newRequest"),
        icon: "file-plus",
        action: () => void tree.createRequest(node.path),
      },
      {
        label: t("contextMenu.newFolder"),
        icon: "folder-plus",
        action: () => void tree.createFolder(node.path),
      },
      {
        label: t("contextMenu.settings"),
        icon: "settings",
        action: () => void requestTabs.openFolderTab(node.path),
      },
      {
        label: t("contextMenu.run"),
        icon: "list-checks",
        action: () => runner.configure(node.path, node.name),
      },
    );
  }
  if (node.kind === "request") {
    items.push(
      {
        label: t("codegen.copyAsCurl"),
        icon: "terminal",
        action: () => void requestTabs.copyAsCurl(node.path),
      },
      {
        label: t("codegen.copyAsCurlWithSecrets"),
        icon: "shield-alert",
        action: () => void requestTabs.copyAsCurl(node.path, true),
      },
    );
  }
  items.push(
    {
      label: t("contextMenu.rename"),
      icon: "pencil",
      separatorBefore: node.kind === "request",
      action: () => tree.startRename(node.path),
    },
    {
      label: t("contextMenu.duplicate"),
      icon: "copy",
      action: () => void tree.duplicate(node.path),
    },
    {
      label: t("contextMenu.moveTo"),
      icon: "folder-input",
      action: () => tree.openMoveCopy(node, "move"),
    },
    {
      label: t("contextMenu.copyTo"),
      icon: "copy-plus",
      action: () => tree.openMoveCopy(node, "copy"),
    },
    {
      label: t("contextMenu.reveal"),
      icon: "folder-open",
      action: () => void tree.reveal(node.path),
    },
    {
      label: t("contextMenu.delete"),
      icon: "trash-2",
      danger: true,
      separatorBefore: true,
      action: () => tree.requestDelete(node),
    },
  );
  return items;
});

let stopListeningToMenu: (() => void) | null = null;
let stopListeningToUpdate: (() => void) | null = null;

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
  stopListeningToUpdate = updateStore.listen();
  window.addEventListener("beforeunload", flushSessionOnUnload);
});

onUnmounted(() => {
  stopListeningToMenu?.();
  stopListeningToUpdate?.();
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
              <WInput
                v-model="tree.filterText"
                :placeholder="t('shell.filterPlaceholder')"
                class="flex-1"
              />
              <span ref="createButton" class="inline-flex">
                <WButton
                  size="sm"
                  variant="ghost"
                  :title="t('shell.newTooltip')"
                  @click="openCreateMenu"
                >
                  <WIcon name="plus" />
                </WButton>
              </span>
            </div>
            <div class="min-h-0 flex-1">
              <WEmptyState
                v-if="!workspace.tree || workspace.tree.children.length === 0"
                :title="t('shell.emptyTree.title')"
                :description="t('shell.emptyTree.description')"
              >
                <template #icon>
                  <WIcon name="folder-open" size="5" />
                </template>
                <template #action>
                  <WButton variant="primary" size="sm" @click="tree.createRequest()">
                    {{ t("shell.emptyTree.newRequest") }}
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
          <WEmptyState
            v-if="requestTabs.tabs.length === 0"
            :title="t('shell.emptyMain.title')"
            :description="t('shell.emptyMain.description')"
          >
            <template #icon>
              <WIcon name="send" size="5" />
            </template>
          </WEmptyState>
          <!-- Aba de environments (EP-08.1-T05) não tem "resposta" — ocupa a coluna
          inteira, sem o painel de resposta ao lado/embaixo, mesmo vazio. -->
          <main
            v-else-if="requestTabs.active?.kind === 'environment'"
            class="flex h-full flex-col bg-surface-1"
          >
            <RequestTabsBar />
            <EnvironmentsPanel class="min-h-0 flex-1" />
          </main>
          <!-- Runner (EP-13-T01): mesma regra da aba de environments — coluna inteira. -->
          <main
            v-else-if="requestTabs.active?.kind === 'runner'"
            class="flex h-full flex-col bg-surface-1"
          >
            <RequestTabsBar />
            <RunnerPanel class="min-h-0 flex-1" />
          </main>
          <WSplitPane
            v-else
            :key="ui.responsePanelPosition"
            :direction="ui.responsePanelPosition === 'side' ? 'horizontal' : 'vertical'"
            sized-pane="second"
            :model-value="ui.responsePanelSize"
            :min="240"
            :other-pane-min="240"
            @update:model-value="ui.setResponsePanelSize"
          >
            <template #first>
              <main class="flex h-full flex-col bg-surface-1">
                <RequestTabsBar />
                <div class="min-h-0 flex-1 overflow-y-auto p-3">
                  <template v-if="requestTabs.active?.kind === 'request'">
                    <RequestUrlBar />
                    <RequestConfigTabs class="mt-3" />
                  </template>
                  <FolderConfigTabs v-else-if="requestTabs.active?.kind === 'folder'" />
                </div>
              </main>
            </template>
            <template #second>
              <section class="flex h-full flex-col bg-surface-2">
                <ResponsePanel v-if="requestTabs.active?.kind === 'request'" />
                <WEmptyState
                  v-else
                  :title="t('shell.emptyResponse.title')"
                  :description="t('shell.emptyResponse.description')"
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
      @open-environment-editor="requestTabs.openEnvironmentTab()"
      @open-preferences="preferencesOpen = true"
    />

    <CommandPalette :open="paletteOpen" @close="paletteOpen = false" />

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
      :title="t('dialog.unsavedChanges.title')"
      @close="requestTabs.cancelClose"
    >
      <p v-if="requestTabs.closeConfirmTab" class="font-inter text-sm text-1">
        {{ t("dialog.unsavedChanges.body", { title: requestTabs.closeConfirmTab.title }) }}
      </p>
      <template #footer>
        <WButton variant="ghost" @click="requestTabs.cancelClose">{{ t("common.cancel") }}</WButton>
        <WButton variant="danger" @click="requestTabs.confirmCloseDiscard">
          {{ t("dialog.unsavedChanges.discard") }}
        </WButton>
        <WButton variant="primary" @click="requestTabs.confirmCloseSave">
          {{ t("common.save") }}
        </WButton>
      </template>
    </WModal>

    <WModal
      :open="requestTabs.unresolvedSendId !== null"
      :title="t('dialog.unresolvedVariable.title')"
      @close="requestTabs.cancelSendUnresolved"
    >
      <p v-if="requestTabs.unresolvedSendTab" class="font-inter text-sm text-1">
        {{
          t(
            requestTabs.unresolvedSendNames.length > 1
              ? "dialog.unresolvedVariable.bodyOther"
              : "dialog.unresolvedVariable.bodyOne",
            {
              title: requestTabs.unresolvedSendTab.title,
              names: requestTabs.unresolvedSendNames.join(", "),
            },
          )
        }}
      </p>
      <template #footer>
        <WButton variant="ghost" @click="requestTabs.cancelSendUnresolved">
          {{ t("common.cancel") }}
        </WButton>
        <WButton variant="primary" @click="requestTabs.confirmSendUnresolved">
          {{ t("dialog.unresolvedVariable.sendAnyway") }}
        </WButton>
      </template>
    </WModal>

    <WModal
      :open="tree.deleteTarget !== null"
      :title="t('dialog.deleteConfirm.title')"
      @close="tree.cancelDelete"
    >
      <p v-if="tree.deleteTarget" class="font-inter text-sm text-1">
        {{ t("dialog.deleteConfirm.body", { name: tree.deleteTarget.node.name }) }}
        <template v-if="tree.deleteTarget.descendantCount > 0">
          {{
            tree.deleteTarget.descendantCount === 1
              ? t("dialog.deleteConfirm.alsoRemovesOne")
              : t("dialog.deleteConfirm.alsoRemovesOther", {
                  count: tree.deleteTarget.descendantCount,
                })
          }}
        </template>
        {{ t("dialog.deleteConfirm.trash") }}
      </p>
      <template #footer>
        <WButton variant="ghost" @click="tree.cancelDelete">{{ t("common.cancel") }}</WButton>
        <WButton variant="danger" @click="tree.confirmDelete">{{ t("common.delete") }}</WButton>
      </template>
    </WModal>
  </div>
</template>

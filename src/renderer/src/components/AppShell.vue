<script setup lang="ts">
import type { WorkspaceNode } from "@shared";

import StatusBar from "@renderer/components/StatusBar.vue";
import WButton from "@renderer/components/WButton.vue";
import WEmptyState from "@renderer/components/WEmptyState.vue";
import WInput from "@renderer/components/WInput.vue";
import WorkspaceLanding from "@renderer/components/WorkspaceLanding.vue";
import WSplitPane from "@renderer/components/WSplitPane.vue";
import WTree from "@renderer/components/WTree.vue";
import { useMenuStore } from "@renderer/stores/menu";
import { useTreeStore } from "@renderer/stores/tree";
import { useUiStore } from "@renderer/stores/ui";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { onMounted, onUnmounted } from "vue";

// Esqueleto definitivo do app (EP-02-T04): sidebar de collections, área central de
// abas de request e painel de resposta. As abas chegam em EP-05-T05 — por ora o
// shell só decide entre a landing (sem workspace) e os painéis vazios.
const ui = useUiStore();
const menu = useMenuStore();
const workspace = useWorkspaceStore();
const tree = useTreeStore();

function onActivate(node: WorkspaceNode): void {
  // Abrir a request numa aba chega em EP-05-T05 — por ora a árvore só navega/seleciona.
  void node;
}

let stopListeningToMenu: (() => void) | null = null;

onMounted(() => {
  void ui.load();
  void workspace.init();
  stopListeningToMenu = menu.listen();
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
            <div class="shrink-0 border-b border-subtle p-2">
              <WInput v-model="tree.filterText" placeholder="Filter…" />
            </div>
            <div class="min-h-0 flex-1">
              <WEmptyState
                v-if="!workspace.tree || workspace.tree.children.length === 0"
                title="No collections yet"
                description="Create your first request."
              />
              <WTree
                v-else
                :nodes="workspace.tree.children"
                :expanded-paths="tree.expandedPaths"
                :selected-path="tree.selectedPath"
                :filter-text="tree.filterText"
                @update:expanded-paths="tree.setExpandedPaths"
                @update:selected-path="tree.selectedPath = $event"
                @activate="onActivate"
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
                <WEmptyState title="No request open" description="Select or create a request." />
              </main>
            </template>
            <template #second>
              <section class="flex h-full flex-col bg-surface-2">
                <WEmptyState
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
  </div>
</template>

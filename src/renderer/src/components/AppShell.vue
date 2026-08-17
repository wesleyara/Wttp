<script setup lang="ts">
import StatusBar from "@renderer/components/StatusBar.vue";
import WButton from "@renderer/components/WButton.vue";
import WEmptyState from "@renderer/components/WEmptyState.vue";
import WSplitPane from "@renderer/components/WSplitPane.vue";
import { useMenuStore } from "@renderer/stores/menu";
import { useUiStore } from "@renderer/stores/ui";
import { onMounted, onUnmounted } from "vue";

// Esqueleto definitivo do app (EP-02-T04): sidebar de collections, área central de
// abas de request e painel de resposta — todos vazios até os épicos de produto.
const ui = useUiStore();
const menu = useMenuStore();

let stopListeningToMenu: (() => void) | null = null;

onMounted(() => {
  void ui.load();
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
      <WSplitPane
        v-if="ui.loaded"
        direction="horizontal"
        :model-value="ui.sidebarWidth"
        :min="200"
        :max="480"
        @update:model-value="ui.setSidebarWidth"
      >
        <template #first>
          <aside class="flex h-full flex-col bg-surface-2">
            <WEmptyState title="No workspace open" description="Open or create a workspace." />
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

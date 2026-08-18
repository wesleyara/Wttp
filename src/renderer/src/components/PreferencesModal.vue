<script setup lang="ts">
import { useSettingsStore } from "@renderer/stores/settings";
import { useWorkspaceStore } from "@renderer/stores/workspace";

import WButton from "./WButton.vue";
import WModal from "./WModal.vue";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const settings = useSettingsStore();
const workspace = useWorkspaceStore();

function close(): void {
  emit("close");
}

async function changeWorkspacesRootDir(): Promise<void> {
  const path = await workspace.pickFolder(settings.workspacesRootDir);
  if (path) settings.setWorkspacesRootDir(path);
}
</script>

<template>
  <WModal :open="open" title="Preferences" size="md" @close="close">
    <div class="flex flex-col gap-2">
      <p class="font-inter text-sm font-medium text-1">Workspaces root folder</p>
      <p class="font-inter text-xs text-muted">
        Workspaces created without picking a folder, and the workspace switcher on the landing
        screen, use this folder.
      </p>
      <div class="flex items-center gap-2">
        <p
          class="flex-1 truncate rounded-md border border-subtle bg-surface-3 px-2 py-1.5 font-mono text-xs text-1"
        >
          {{ settings.workspacesRootDir ?? "Not set" }}
        </p>
        <WButton size="sm" variant="secondary" @click="changeWorkspacesRootDir">Change…</WButton>
      </div>
      <p v-if="settings.workspacesContainerDir" class="font-mono text-[11px] text-faint">
        Workspaces are created in: {{ settings.workspacesContainerDir }}/
      </p>
    </div>

    <template #footer>
      <WButton variant="secondary" @click="close">Close</WButton>
    </template>
  </WModal>
</template>

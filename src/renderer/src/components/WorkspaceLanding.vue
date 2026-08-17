<script setup lang="ts">
import WButton from "@renderer/components/WButton.vue";
import WInput from "@renderer/components/WInput.vue";
import WModal from "@renderer/components/WModal.vue";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { ref } from "vue";

const workspace = useWorkspaceStore();

const createModalOpen = ref(false);
const createPath = ref<string | null>(null);
const createName = ref("");

const initName = ref("");

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

async function onOpen(): Promise<void> {
  await workspace.open();
}

async function onStartCreate(): Promise<void> {
  const path = await workspace.pickFolder();
  if (!path) return;
  createPath.value = path;
  createName.value = "";
  createModalOpen.value = true;
}

async function onConfirmCreate(): Promise<void> {
  if (!createPath.value || !createName.value.trim()) return;
  await workspace.create(createPath.value, createName.value.trim());
  createModalOpen.value = false;
}

async function onOpenRecent(path: string): Promise<void> {
  await workspace.open(path);
}

async function onRemoveRecent(path: string, event: MouseEvent): Promise<void> {
  event.stopPropagation();
  await workspace.removeRecent(path);
}

async function onInitializeHere(): Promise<void> {
  if (!workspace.root || !initName.value.trim()) return;
  await workspace.create(workspace.root, initName.value.trim());
}
</script>

<template>
  <div class="flex h-full items-center justify-center bg-surface-1 p-8">
    <div v-if="workspace.needsInit" class="flex w-full max-w-sm flex-col gap-4">
      <p class="font-barlow text-lg font-semibold text-1">Not a workspace yet</p>
      <p class="font-inter text-sm text-muted">
        "{{ workspace.root }}" doesn't have a <span class="font-mono text-[13px]">wttp.yaml</span>.
        Initialize it as a new workspace?
      </p>
      <WInput v-model="initName" placeholder="Workspace name" />
      <div class="flex gap-2">
        <WButton variant="primary" :disabled="!initName.trim()" @click="onInitializeHere">
          Initialize here
        </WButton>
        <WButton variant="ghost" @click="workspace.close">Choose a different folder</WButton>
      </div>
    </div>

    <div v-else class="flex w-full max-w-md flex-col gap-6">
      <div class="flex flex-col gap-1 text-center">
        <p class="font-barlow text-lg font-semibold text-1">Wttp</p>
        <p class="font-inter text-sm text-muted">Open or create a workspace to get started.</p>
      </div>

      <div class="flex justify-center gap-2">
        <WButton variant="primary" @click="onOpen">Open workspace</WButton>
        <WButton variant="secondary" @click="onStartCreate">Create workspace</WButton>
        <WButton variant="ghost" disabled title="Coming soon (EP-08)">Import</WButton>
      </div>

      <p v-if="workspace.error" class="text-center font-inter text-sm text-status-5xx">
        {{ workspace.error.message }}
      </p>

      <div v-if="workspace.recents.length > 0" class="flex flex-col gap-1">
        <p class="font-inter text-xs font-medium text-muted">Recent</p>
        <ul class="flex flex-col divide-y divide-subtle rounded-md border border-subtle">
          <li
            v-for="entry in workspace.recents"
            :key="entry.path"
            tabindex="0"
            role="button"
            class="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            @click="entry.missing ? undefined : onOpenRecent(entry.path)"
            @keydown.enter="entry.missing ? undefined : onOpenRecent(entry.path)"
          >
            <div class="min-w-0">
              <p class="truncate font-inter text-sm text-1">{{ entry.name }}</p>
              <p class="truncate font-mono text-[11px] text-faint">{{ entry.path }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span v-if="entry.missing" class="font-inter text-xs text-status-5xx">Missing</span>
              <span v-else class="font-inter text-xs text-faint">{{
                formatDate(entry.lastOpened)
              }}</span>
              <WButton size="sm" variant="ghost" @click="onRemoveRecent(entry.path, $event)">
                Remove
              </WButton>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <WModal :open="createModalOpen" title="Create workspace" @close="createModalOpen = false">
      <div class="flex flex-col gap-3">
        <p class="font-mono text-[11px] text-faint">{{ createPath }}</p>
        <WInput v-model="createName" placeholder="Workspace name" />
      </div>
      <template #footer>
        <WButton variant="ghost" @click="createModalOpen = false">Cancel</WButton>
        <WButton variant="primary" :disabled="!createName.trim()" @click="onConfirmCreate">
          Create
        </WButton>
      </template>
    </WModal>
  </div>
</template>

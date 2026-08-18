<script setup lang="ts">
import type { DiscoveredWorkspace } from "@shared";

import ImportModal from "@renderer/components/ImportModal.vue";
import WButton from "@renderer/components/WButton.vue";
import WInput from "@renderer/components/WInput.vue";
import WModal from "@renderer/components/WModal.vue";
import { useSettingsStore } from "@renderer/stores/settings";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { onMounted, ref, watch } from "vue";

const workspace = useWorkspaceStore();
const settings = useSettingsStore();

const createModalOpen = ref(false);
/** `null` quando a raiz de workspaces está configurada — o caminho é computado a partir do nome, sem picker. */
const createPath = ref<string | null>(null);
const createName = ref("");

const initName = ref("");

const importModalOpen = ref(false);

const discovered = ref<DiscoveredWorkspace[]>([]);

async function refreshDiscovered(): Promise<void> {
  if (!settings.workspacesContainerDir) {
    discovered.value = [];
    return;
  }
  discovered.value = await window.wttp.workspace.listInDir({
    dir: settings.workspacesContainerDir,
  });
}

onMounted(refreshDiscovered);
watch(() => settings.workspacesRootDir, refreshDiscovered);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

async function onOpen(): Promise<void> {
  await workspace.open();
}

async function onStartCreate(): Promise<void> {
  if (settings.workspacesRootDir) {
    createPath.value = null;
    createName.value = "";
    createModalOpen.value = true;
    return;
  }

  const path = await workspace.pickFolder(settings.defaultWorkspaceDir);
  if (!path) return;
  createPath.value = path;
  createName.value = "";
  createModalOpen.value = true;
}

/** Muda a pasta padrão sugerida na próxima vez que "Create workspace" abrir o diálogo — não cria nada aqui. */
async function onChangeDefaultDir(): Promise<void> {
  const path = await workspace.pickFolder(settings.defaultWorkspaceDir);
  if (path) settings.setDefaultWorkspaceDir(path);
}

async function onConfirmCreate(): Promise<void> {
  const name = createName.value.trim();
  if (!name) return;

  const path = createPath.value ?? `${settings.workspacesContainerDir}/${name}`;
  await workspace.create(path, name);
  createModalOpen.value = false;
  await refreshDiscovered();
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

async function onCloseImportModal(): Promise<void> {
  importModalOpen.value = false;
  await refreshDiscovered();
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
      <div class="flex flex-col items-center gap-2 text-center">
        <svg viewBox="0 0 1024 1024" class="size-10" aria-hidden="true">
          <path
            d="M 180 360 L 342 664 L 512 450 L 682 664 L 844 360"
            fill="none"
            stroke="url(#wttp-mark-gradient)"
            stroke-width="72"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <defs>
            <linearGradient
              id="wttp-mark-gradient"
              x1="180"
              y1="360"
              x2="844"
              y2="360"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stop-color="#40bef0" />
              <stop offset="1" stop-color="#18aae5" />
            </linearGradient>
          </defs>
        </svg>
        <p class="font-barlow text-lg font-semibold text-1">Wttp</p>
        <p class="font-inter text-sm text-muted">Open or create a workspace to get started.</p>
      </div>

      <div class="flex justify-center gap-2">
        <WButton variant="primary" @click="onOpen">Open workspace</WButton>
        <WButton variant="secondary" @click="onStartCreate">Create workspace</WButton>
        <WButton variant="ghost" @click="importModalOpen = true">Import</WButton>
      </div>

      <p v-if="workspace.error" class="text-center font-inter text-sm text-status-5xx">
        {{ workspace.error.message }}
      </p>

      <div class="flex items-center justify-center gap-1.5 font-inter text-xs text-faint">
        <span v-if="settings.defaultWorkspaceDir" class="truncate font-mono text-[11px]">
          Default folder: {{ settings.defaultWorkspaceDir }}
        </span>
        <span v-else>No default folder set</span>
        <button
          type="button"
          class="text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          @click="onChangeDefaultDir"
        >
          Change
        </button>
      </div>

      <div v-if="discovered.length > 0" class="flex flex-col gap-1">
        <p class="font-inter text-xs font-medium text-muted">Workspaces</p>
        <ul class="flex flex-col divide-y divide-subtle rounded-md border border-subtle">
          <li
            v-for="entry in discovered"
            :key="entry.path"
            tabindex="0"
            role="button"
            class="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            :class="{ 'opacity-60': !entry.valid }"
            @click="onOpenRecent(entry.path)"
            @keydown.enter="onOpenRecent(entry.path)"
          >
            <div class="min-w-0">
              <p class="truncate font-inter text-sm text-1">{{ entry.name }}</p>
              <p class="truncate font-mono text-[11px] text-faint">{{ entry.path }}</p>
            </div>
            <span v-if="!entry.valid" class="shrink-0 font-inter text-xs text-faint">
              No wttp.yaml yet
            </span>
          </li>
        </ul>
      </div>

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
        <p class="font-mono text-[11px] text-faint">
          {{ createPath ?? `${settings.workspacesContainerDir}/${createName || "…"}` }}
        </p>
        <WInput v-model="createName" placeholder="Workspace name" />
      </div>
      <template #footer>
        <WButton variant="ghost" @click="createModalOpen = false">Cancel</WButton>
        <WButton variant="primary" :disabled="!createName.trim()" @click="onConfirmCreate">
          Create
        </WButton>
      </template>
    </WModal>

    <ImportModal :open="importModalOpen" @close="onCloseImportModal" />
  </div>
</template>

<script setup lang="ts">
import type { DiscoveredWorkspace } from "@shared";

import ImportModal from "@renderer/components/ImportModal.vue";
import WButton from "@renderer/components/WButton.vue";
import WInput from "@renderer/components/WInput.vue";
import WModal from "@renderer/components/WModal.vue";
import { useImportStore } from "@renderer/stores/import";
import { useSettingsStore } from "@renderer/stores/settings";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const emit = defineEmits<{
  "open-preferences": [];
}>();

const { t } = useI18n();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();
const importStore = useImportStore();

const createModalOpen = ref(false);
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

function onStartCreate(): void {
  if (!settings.workspacesRootDir) {
    emit("open-preferences");
    return;
  }
  createName.value = "";
  createModalOpen.value = true;
}

async function onConfirmCreate(): Promise<void> {
  const name = createName.value.trim();
  if (!name) return;

  await workspace.create(`${settings.workspacesContainerDir}/${name}`, name);
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

function onOpenImportModal(): void {
  importStore.startNewWorkspace();
  importModalOpen.value = true;
}
</script>

<template>
  <div class="flex h-full items-center justify-center bg-surface-1 p-8">
    <div v-if="workspace.needsInit" class="flex w-full max-w-sm flex-col gap-4">
      <p class="font-barlow text-lg font-semibold text-1">
        {{ t("landing.notWorkspaceTitle") }}
      </p>
      <p class="font-inter text-sm text-muted">
        {{ t("landing.notWorkspaceDescription", { path: workspace.root }) }}
      </p>
      <WInput v-model="initName" :placeholder="t('landing.workspaceNamePlaceholder')" />
      <div class="flex gap-2">
        <WButton variant="primary" :disabled="!initName.trim()" @click="onInitializeHere">
          {{ t("landing.initializeHere") }}
        </WButton>
        <WButton variant="ghost" @click="workspace.close">
          {{ t("landing.chooseDifferentFolder") }}
        </WButton>
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
        <p class="font-inter text-sm text-muted">{{ t("landing.tagline") }}</p>
      </div>

      <div class="flex justify-center gap-2">
        <WButton variant="primary" @click="onOpen">{{ t("landing.openWorkspace") }}</WButton>
        <WButton variant="secondary" @click="onStartCreate">
          {{ t("landing.createWorkspace") }}
        </WButton>
        <WButton variant="ghost" @click="onOpenImportModal">{{ t("landing.import") }}</WButton>
      </div>

      <p v-if="workspace.error" class="text-center font-inter text-sm text-status-5xx">
        {{ workspace.error.message }}
      </p>

      <div
        v-if="!settings.workspacesRootDir"
        class="flex items-center justify-center gap-1.5 font-inter text-xs text-faint"
      >
        <span>{{ t("landing.noRootFolder") }}</span>
        <button
          type="button"
          class="text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          @click="emit('open-preferences')"
        >
          {{ t("landing.setIt") }}
        </button>
      </div>

      <div v-if="discovered.length > 0" class="flex flex-col gap-1">
        <p class="font-inter text-xs font-medium text-muted">
          {{ t("landing.workspaces") }}
        </p>
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
              {{ t("landing.noYamlYet") }}
            </span>
          </li>
        </ul>
      </div>

      <div v-if="workspace.recents.length > 0" class="flex flex-col gap-1">
        <p class="font-inter text-xs font-medium text-muted">{{ t("landing.recent") }}</p>
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
              <span v-if="entry.missing" class="font-inter text-xs text-status-5xx">{{
                t("landing.missing")
              }}</span>
              <span v-else class="font-inter text-xs text-faint">{{
                formatDate(entry.lastOpened)
              }}</span>
              <WButton size="sm" variant="ghost" @click="onRemoveRecent(entry.path, $event)">
                {{ t("landing.remove") }}
              </WButton>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <WModal
      :open="createModalOpen"
      :title="t('landing.createWorkspaceTitle')"
      @close="createModalOpen = false"
    >
      <div class="flex flex-col gap-3">
        <p class="font-mono text-[11px] text-faint">
          {{ `${settings.workspacesContainerDir}/${createName || "…"}` }}
        </p>
        <WInput v-model="createName" :placeholder="t('landing.workspaceNamePlaceholder')" />
      </div>
      <template #footer>
        <WButton variant="ghost" @click="createModalOpen = false">
          {{ t("common.cancel") }}
        </WButton>
        <WButton variant="primary" :disabled="!createName.trim()" @click="onConfirmCreate">
          {{ t("common.create") }}
        </WButton>
      </template>
    </WModal>

    <ImportModal :open="importModalOpen" @close="onCloseImportModal" />
  </div>
</template>

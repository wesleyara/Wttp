<script setup lang="ts">
import type { ImportFormat } from "@shared";

import ImportPreviewTree from "@renderer/components/ImportPreviewTree.vue";
import WButton from "@renderer/components/WButton.vue";
import WCodeEditor from "@renderer/components/WCodeEditor.vue";
import WIcon from "@renderer/components/WIcon.vue";
import WInput from "@renderer/components/WInput.vue";
import WModal from "@renderer/components/WModal.vue";
import WSelect from "@renderer/components/WSelect.vue";
import { useImportStore } from "@renderer/stores/import";
import { useSettingsStore } from "@renderer/stores/settings";
import { computed } from "vue";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const store = useImportStore();
const settings = useSettingsStore();

const destinationPath = computed(() => {
  if (!settings.workspacesRootDir) return null;
  const name = store.workspaceName.trim() || "…";
  return `${settings.workspacesContainerDir}/${name}`;
});

async function onConfirm(): Promise<void> {
  if (store.mode === "newWorkspace" && settings.workspacesRootDir) {
    store.workspaceDir = settings.workspacesContainerDir ?? null;
  }
  await store.confirm();
}

function onDone(): void {
  emit("close");
}

async function onCopyReport(): Promise<void> {
  await navigator.clipboard.writeText(store.reportText);
}

const title = computed(() => {
  if (store.step === "preview") return "Import — preview";
  if (store.step === "report") return "Import — report";
  return "Import";
});
</script>

<template>
  <WModal :open="open" :title="title" size="lg" @close="emit('close')">
    <div class="flex min-h-[320px] flex-col gap-4">
      <template v-if="store.step === 'source'">
        <div class="flex items-center gap-2">
          <WButton variant="secondary" @click="store.loadFromFile">Choose file…</WButton>
          <span v-if="store.sourcePath" class="truncate font-mono text-[11px] text-faint">
            {{ store.sourcePath }}
          </span>
          <span v-else class="font-inter text-xs text-faint">or paste content below</span>
        </div>

        <WCodeEditor
          :model-value="store.content"
          language="text"
          class="h-56"
          @update:model-value="store.setContent"
        />

        <div v-if="store.content.trim()" class="flex items-center gap-2">
          <span class="font-inter text-xs text-muted">Format</span>
          <WSelect
            :model-value="store.format ?? ''"
            :options="store.formatOptions"
            @update:model-value="value => store.setFormat(value as ImportFormat)"
          />
          <span v-if="!store.format" class="font-inter text-xs text-status-5xx">
            Format not recognized — pick one manually.
          </span>
        </div>
      </template>

      <template v-else-if="store.step === 'preview'">
        <div v-if="store.mode === 'newWorkspace'" class="flex flex-col gap-2">
          <WInput v-model="store.workspaceName" placeholder="Workspace name" />
          <p v-if="!settings.workspacesRootDir" class="font-inter text-xs text-status-5xx">
            Set a workspaces root folder in Preferences before importing.
          </p>
          <span v-else class="truncate font-mono text-[11px] text-faint">
            {{ destinationPath }}
          </span>
        </div>
        <p v-else class="font-inter text-xs text-muted">
          Imports as a new collection at the root of the current workspace.
        </p>

        <div
          v-if="store.preview"
          class="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-md border border-subtle p-2"
        >
          <ImportPreviewTree :nodes="store.preview.children" />
        </div>

        <div
          v-if="store.preview && store.preview.environments.length > 0"
          class="font-inter text-xs text-muted"
        >
          Environments:
          <span v-for="(env, index) in store.preview.environments" :key="env.name">
            {{ env.name }} ({{ env.variableCount }} vars){{
              index < store.preview.environments.length - 1 ? ", " : ""
            }}
          </span>
        </div>

        <div
          v-if="store.preview && store.preview.notConverted.length > 0"
          class="flex flex-col gap-1"
        >
          <p class="flex items-center gap-1.5 font-inter text-xs font-medium text-status-5xx">
            <WIcon name="triangle-alert" size="3.5" />
            {{ store.preview.notConverted.length }} item(s) need manual attention after import
          </p>
          <ul class="max-h-32 overflow-y-auto font-inter text-xs text-muted">
            <li v-for="(item, index) in store.preview.notConverted" :key="index" class="py-0.5">
              <span class="text-1">{{ item.path }}</span> — {{ item.reason }}
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="store.step === 'report' && store.report">
        <div class="grid grid-cols-3 gap-2 font-inter text-sm text-1">
          <div class="rounded-md border border-subtle p-2 text-center">
            <p class="text-lg font-semibold">{{ store.report.createdFolders }}</p>
            <p class="text-xs text-faint">Folders</p>
          </div>
          <div class="rounded-md border border-subtle p-2 text-center">
            <p class="text-lg font-semibold">{{ store.report.createdRequests }}</p>
            <p class="text-xs text-faint">Requests</p>
          </div>
          <div class="rounded-md border border-subtle p-2 text-center">
            <p class="text-lg font-semibold">{{ store.report.createdEnvironments }}</p>
            <p class="text-xs text-faint">Environments</p>
          </div>
        </div>

        <div
          v-if="store.report.notConverted.length === 0"
          class="font-inter text-sm text-status-2xx"
        >
          Everything converted — nothing needs manual attention.
        </div>
        <div v-else class="flex flex-col gap-1">
          <p class="flex items-center gap-1.5 font-inter text-xs font-medium text-status-5xx">
            <WIcon name="triangle-alert" size="3.5" />
            {{ store.report.notConverted.length }} item(s) need manual attention
          </p>
          <ul
            class="max-h-56 overflow-y-auto rounded-md border border-subtle p-2 font-inter text-xs text-muted"
          >
            <li v-for="(item, index) in store.report.notConverted" :key="index" class="py-0.5">
              <span class="text-1">{{ item.path }}</span> — {{ item.reason }}
            </li>
          </ul>
        </div>

        <div class="flex gap-2">
          <WButton variant="ghost" size="sm" @click="onCopyReport">Copy report</WButton>
          <WButton variant="ghost" size="sm" @click="store.saveReportToFile">Save report…</WButton>
        </div>
      </template>

      <p v-if="store.error" class="font-inter text-sm text-status-5xx">{{ store.error.message }}</p>
    </div>

    <template #footer>
      <template v-if="store.step === 'source'">
        <WButton variant="ghost" @click="emit('close')">Cancel</WButton>
        <WButton
          variant="primary"
          :disabled="!store.canPreview || store.loading"
          @click="store.loadPreview"
        >
          Next
        </WButton>
      </template>
      <template v-else-if="store.step === 'preview'">
        <WButton variant="ghost" @click="store.step = 'source'">Back</WButton>
        <WButton
          variant="primary"
          :disabled="
            !store.canConfirm ||
            (store.mode === 'newWorkspace' && !destinationPath) ||
            store.loading
          "
          @click="onConfirm"
        >
          Import
        </WButton>
      </template>
      <template v-else-if="store.step === 'report'">
        <WButton variant="primary" @click="onDone">Done</WButton>
      </template>
    </template>
  </WModal>
</template>

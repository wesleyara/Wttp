<script setup lang="ts">
import type { DiffItem } from "@renderer/lib/structuralDiff";

import { useChangesStore } from "@renderer/stores/changes";
import { GIT_STATUS_LETTER, useGitStore } from "@renderer/stores/git";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WSelect from "./WSelect.vue";

/**
 * Aba Changes (ClickLocal #52): o que mudou no workspace desde uma base, e o diff de cada
 * arquivo campo a campo — "header `X-Api-Version` 1 → 2", não YAML linha a linha.
 */

const { t, te } = useI18n();
const changes = useChangesStore();
const git = useGitStore();
const { groups, selected, diff, loading, loadingDiff, base, refs, error } = storeToRefs(changes);

const STATUS_CLASS: Record<string, string> = {
  modified: "text-status-4xx",
  added: "text-status-2xx",
  untracked: "text-status-2xx",
  deleted: "text-status-5xx",
  conflicted: "text-status-5xx",
};

const baseOptions = computed(() => [
  {
    value: "HEAD",
    label: t("changes.baseHead", { branch: git.repository?.branch ?? "HEAD" }),
  },
  ...refs.value
    .filter(ref => !ref.current)
    .map(ref => ({ value: ref.name, label: t(`changes.refKind.${ref.kind}`, { name: ref.name }) })),
]);

const baseValue = computed({
  get: () => base.value,
  set: value => void changes.setBase(value),
});

function fileLabel(path: string): string {
  const name = path.split("/").pop() ?? path;
  if (name === "folder.yaml") return t("changes.folderSettings");
  return name.replace(/\.req\.yaml$/, "");
}

function sectionTitle(id: string): string {
  return t(`changes.sections.${id}`);
}

function itemLabel(item: DiffItem): string {
  if (!item.label) return "";
  const key = `changes.labels.${item.label}`;
  return te(key) ? t(key) : item.label;
}

const LINE_CLASS: Record<string, string> = {
  same: "text-muted",
  added: "bg-status-2xx/10 text-status-2xx",
  removed: "bg-status-5xx/10 text-status-5xx",
};
const LINE_PREFIX: Record<string, string> = { same: " ", added: "+", removed: "−" };
</script>

<template>
  <div class="flex min-h-0 flex-col overflow-hidden bg-surface-1" data-testid="changes-panel">
    <header class="flex shrink-0 items-center gap-3 border-b border-subtle px-4 py-2">
      <WIcon name="git-compare" size="4" class="text-faint" />
      <h2 class="font-barlow text-base font-semibold text-1">{{ t("changes.title") }}</h2>
      <span class="font-inter text-xs text-faint">
        {{ t("changes.count", { count: changes.changes.length }) }}
      </span>
      <span class="flex-1" />
      <label class="flex items-center gap-2 font-inter text-xs text-muted">
        {{ t("changes.compareWith") }}
        <div class="w-56">
          <WSelect v-model="baseValue" :options="baseOptions" data-testid="changes-base" />
        </div>
      </label>
      <WButton
        size="sm"
        variant="ghost"
        :title="t('changes.refresh')"
        :aria-label="t('changes.refresh')"
        @click="changes.load()"
      >
        <WIcon name="refresh-cw" :class="{ 'animate-spin': loading }" />
      </WButton>
    </header>

    <p
      v-if="error"
      class="mx-4 mt-2 rounded-md bg-status-5xx/10 px-3 py-2 font-inter text-xs text-status-5xx"
    >
      {{ error.message }}
    </p>

    <WEmptyState
      v-if="!git.repository"
      :title="t('changes.noRepo.title')"
      :description="t('changes.noRepo.description')"
    />
    <WEmptyState
      v-else-if="!loading && changes.changes.length === 0"
      :title="t('changes.empty.title')"
      :description="t('changes.empty.description', { base })"
    >
      <template #icon>
        <WIcon name="circle-check" size="5" />
      </template>
    </WEmptyState>

    <div v-else class="flex min-h-0 flex-1">
      <!-- Lista agrupada por pasta -->
      <nav
        class="w-72 shrink-0 overflow-y-auto border-r border-subtle py-2"
        :aria-label="t('changes.listLabel')"
        data-testid="changes-list"
      >
        <section v-for="group in groups" :key="group.folder" class="mb-2">
          <h3 class="truncate px-3 py-1 font-mono text-[11px] text-faint" :title="group.folder">
            {{ group.folder || t("changes.workspaceRoot") }}
          </h3>
          <button
            v-for="change in group.changes"
            :key="change.path"
            type="button"
            class="flex h-7 w-full items-center gap-2 px-3 text-left font-inter text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
            :class="
              changes.selectedPath === change.path
                ? 'bg-surface-3 text-1'
                : 'text-muted hover:bg-surface-3/50'
            "
            :aria-current="changes.selectedPath === change.path ? 'true' : undefined"
            @click="changes.select(change.path)"
          >
            <span
              class="w-3 shrink-0 font-mono text-[11px] font-semibold"
              :class="STATUS_CLASS[change.status]"
              :title="t(`git.status.${change.status}`)"
            >
              {{ GIT_STATUS_LETTER[change.status] }}
            </span>
            <span class="min-w-0 flex-1 truncate">{{ fileLabel(change.path) }}</span>
          </button>
        </section>
      </nav>

      <!-- Diff do arquivo selecionado -->
      <section class="min-w-0 flex-1 overflow-y-auto p-4" data-testid="changes-diff">
        <template v-if="selected">
          <div class="mb-3 flex items-center gap-2">
            <span
              class="font-mono text-[11px] font-semibold"
              :class="STATUS_CLASS[selected.status]"
            >
              {{ GIT_STATUS_LETTER[selected.status] }}
            </span>
            <span class="truncate font-mono text-[13px] text-1">{{ selected.path }}</span>
            <span v-if="selected.from" class="truncate font-mono text-[11px] text-faint">
              {{ t("changes.renamedFrom", { from: selected.from }) }}
            </span>
          </div>

          <p v-if="loadingDiff" class="font-inter text-xs text-faint">{{ t("changes.loading") }}</p>

          <template v-else-if="diff?.mode === 'text'">
            <p
              v-if="diff.invalid"
              class="mb-2 flex items-center gap-1.5 rounded-md bg-status-4xx/10 px-2 py-1 font-inter text-xs text-status-4xx"
            >
              <WIcon name="triangle-alert" size="3.5" /> {{ t("changes.invalidYaml") }}
            </p>
            <pre
              class="overflow-x-auto rounded-md border border-subtle bg-surface-2 py-1 font-mono text-[12px]"
            ><div
                v-for="(line, index) in diff.lines"
                :key="index"
                class="whitespace-pre px-2"
                :class="LINE_CLASS[line.type]"
              >{{ LINE_PREFIX[line.type] }} {{ line.text }}</div></pre>
          </template>

          <template v-else-if="diff?.mode === 'fields'">
            <p v-if="diff.sections.length === 0" class="font-inter text-xs text-faint">
              {{ t("changes.noFieldChanges") }}
            </p>
            <div
              v-for="diffSection in diff.sections"
              :key="diffSection.id"
              class="mb-4"
              data-testid="changes-section"
            >
              <h4 class="mb-1 font-inter text-xs font-semibold text-1">
                {{ sectionTitle(diffSection.id) }}
              </h4>
              <ul class="flex flex-col gap-1">
                <li
                  v-for="(item, index) in diffSection.items"
                  :key="index"
                  class="flex flex-col gap-1 font-inter text-xs"
                >
                  <div class="flex flex-wrap items-baseline gap-x-2">
                    <span
                      class="rounded px-1 font-medium"
                      :class="{
                        'bg-status-2xx/10 text-status-2xx': item.kind === 'added',
                        'bg-status-5xx/10 text-status-5xx': item.kind === 'removed',
                        'bg-status-4xx/10 text-status-4xx': item.kind === 'changed',
                      }"
                    >
                      {{ t(`changes.kind.${item.kind}`) }}
                    </span>
                    <span v-if="itemLabel(item)" class="font-mono text-[12px] text-1">
                      {{ itemLabel(item) }}
                    </span>
                    <template v-if="!item.lines">
                      <span
                        v-if="item.before !== undefined"
                        class="break-all font-mono text-[12px] text-status-5xx"
                        :class="{ 'line-through': item.kind === 'changed' }"
                      >
                        {{ item.before || "∅" }}
                      </span>
                      <span v-if="item.kind === 'changed'" class="text-faint">→</span>
                      <span
                        v-if="item.after !== undefined"
                        class="break-all font-mono text-[12px] text-status-2xx"
                      >
                        {{ item.after || "∅" }}
                      </span>
                    </template>
                  </div>
                  <pre
                    v-if="item.lines"
                    class="overflow-x-auto rounded-md border border-subtle bg-surface-2 py-1 font-mono text-[12px]"
                  ><div
                      v-for="(line, lineIndex) in item.lines"
                      :key="lineIndex"
                      class="whitespace-pre px-2"
                      :class="LINE_CLASS[line.type]"
                    >{{ LINE_PREFIX[line.type] }} {{ line.text }}</div></pre>
                </li>
              </ul>
            </div>
          </template>
        </template>
        <p v-else class="font-inter text-xs text-faint">{{ t("changes.pickFile") }}</p>
      </section>
    </div>
  </div>
</template>

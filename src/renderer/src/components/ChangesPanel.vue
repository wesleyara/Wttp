<script setup lang="ts">
import type { ChangeGroup } from "@renderer/stores/changes";
import type { GitFileChange } from "@shared";

import { useChangesStore } from "@renderer/stores/changes";
import { GIT_STATUS_LETTER, useGitStore } from "@renderer/stores/git";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import FileDiffView from "./FileDiffView.vue";
import WButton from "./WButton.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WModal from "./WModal.vue";
import WSelect from "./WSelect.vue";

/**
 * Aba Changes (ClickLocal #52): o que mudou no workspace desde uma base, e o diff de cada
 * arquivo campo a campo — "header `X-Api-Version` 1 → 2", não YAML linha a linha.
 */

const { t } = useI18n();
const changes = useChangesStore();
const git = useGitStore();
const {
  groups,
  stagedGroups,
  unstagedGroups,
  selected,
  diff,
  loading,
  loadingDiff,
  base,
  refs,
  error,
  commitMessage,
  busy,
} = storeToRefs(changes);

// --- Commit e descarte (ClickLocal #53) ---------------------------------------------------
function onCommitKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void changes.commit();
  }
}

/** Descarte pendente de confirmação — o que vai ser perdido, dito antes. */
const discardTarget = ref<GitFileChange[] | null>(null);
const discardDirtyTabs = computed(() =>
  discardTarget.value ? changes.dirtyTabsFor(discardTarget.value.map(change => change.path)) : [],
);
const discardDeletes = computed(() =>
  (discardTarget.value ?? []).filter(
    change => change.status === "untracked" || (change.status === "added" && !change.from),
  ),
);

async function confirmDiscard(): Promise<void> {
  const target = discardTarget.value;
  discardTarget.value = null;
  if (target) await changes.discard(target.map(change => change.path));
}

function pathsOf(group: ChangeGroup): string[] {
  return group.changes.map(change => change.path);
}

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
    >
      <template v-if="git.available" #action>
        <WButton
          variant="primary"
          size="sm"
          :disabled="busy"
          data-testid="git-init"
          @click="changes.initRepository()"
        >
          <WIcon name="git-branch-plus" />
          {{ t("changes.init") }}
        </WButton>
      </template>
    </WEmptyState>
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
      <!-- Commit + lista agrupada por pasta -->
      <nav
        class="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-subtle"
        :aria-label="t('changes.listLabel')"
        data-testid="changes-list"
      >
        <div v-if="changes.canWrite" class="flex flex-col gap-2 border-b border-subtle p-3">
          <textarea
            v-model="commitMessage"
            rows="3"
            class="w-full resize-y rounded-md border border-subtle bg-surface-2 px-2 py-1.5 font-inter text-sm text-1 placeholder:text-faint focus-visible:border-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus"
            :placeholder="t('changes.commitPlaceholder')"
            :aria-label="t('changes.commitPlaceholder')"
            data-testid="commit-message"
            @keydown="onCommitKeydown"
          />
          <WButton
            variant="primary"
            :disabled="busy || changes.stagedCount === 0 || commitMessage.trim() === ''"
            :title="t('changes.commitHint')"
            data-testid="commit-button"
            @click="changes.commit()"
          >
            <WIcon name="git-commit-horizontal" />
            {{ t("changes.commit", { count: changes.stagedCount }) }}
          </WButton>
        </div>

        <template v-if="changes.canWrite">
          <div
            v-for="block in [
              { id: 'staged', title: t('changes.staged'), groups: stagedGroups, staged: true },
              {
                id: 'unstaged',
                title: t('changes.unstaged'),
                groups: unstagedGroups,
                staged: false,
              },
            ]"
            :key="block.id"
            class="py-2"
            :data-testid="`changes-${block.id}`"
          >
            <div class="flex items-center gap-1 px-3 pb-1">
              <h3 class="flex-1 font-inter text-xs font-semibold text-muted">
                {{ block.title }}
                <span class="font-normal text-faint">{{
                  block.groups.reduce((n, g) => n + g.changes.length, 0)
                }}</span>
              </h3>
              <WButton
                v-if="!block.staged && block.groups.length"
                size="sm"
                variant="ghost"
                :disabled="busy"
                data-testid="stage-all"
                @click="changes.stageAll()"
              >
                {{ t("changes.stageAll") }}
              </WButton>
            </div>
            <section v-for="group in block.groups" :key="group.folder" class="mb-1">
              <div class="group/folder flex items-center gap-1 pl-3 pr-2">
                <h4
                  class="min-w-0 flex-1 truncate py-1 font-mono text-[11px] text-faint"
                  :title="group.folder"
                >
                  {{ group.folder || t("changes.workspaceRoot") }}
                </h4>
                <button
                  v-if="block.staged"
                  type="button"
                  class="hidden size-6 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 group-hover/folder:flex"
                  :title="t('changes.unstageFolder')"
                  :aria-label="t('changes.unstageFolder')"
                  :disabled="busy"
                  @click="changes.unstage(pathsOf(group))"
                >
                  <WIcon name="minus" size="3.5" />
                </button>
                <template v-else>
                  <button
                    type="button"
                    class="hidden size-6 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 group-hover/folder:flex"
                    :title="t('changes.discardFolder')"
                    :aria-label="t('changes.discardFolder')"
                    :disabled="busy"
                    @click="discardTarget = group.changes"
                  >
                    <WIcon name="undo-2" size="3.5" />
                  </button>
                  <button
                    type="button"
                    class="hidden size-6 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 group-hover/folder:flex"
                    :title="t('changes.stageFolder')"
                    :aria-label="t('changes.stageFolder')"
                    :disabled="busy"
                    @click="changes.stage(pathsOf(group))"
                  >
                    <WIcon name="plus" size="3.5" />
                  </button>
                </template>
              </div>
              <div
                v-for="change in group.changes"
                :key="change.path"
                class="group/row flex h-7 items-center pr-2"
                :class="
                  changes.selectedPath === change.path
                    ? 'bg-surface-3 text-1'
                    : 'text-muted hover:bg-surface-3/50'
                "
                data-testid="change-row"
              >
                <button
                  type="button"
                  class="flex h-full min-w-0 flex-1 items-center gap-2 pl-5 text-left font-inter text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
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
                <button
                  v-if="block.staged"
                  type="button"
                  class="flex size-6 shrink-0 items-center justify-center rounded text-faint opacity-0 hover:bg-surface-2 hover:text-1 focus-visible:opacity-100 group-hover/row:opacity-100"
                  :title="t('changes.unstageFile')"
                  :aria-label="t('changes.unstageFile')"
                  :disabled="busy"
                  data-testid="unstage-file"
                  @click="changes.unstage([change.path])"
                >
                  <WIcon name="minus" size="3.5" />
                </button>
                <template v-else>
                  <button
                    type="button"
                    class="flex size-6 shrink-0 items-center justify-center rounded text-faint opacity-0 hover:bg-surface-2 hover:text-1 focus-visible:opacity-100 group-hover/row:opacity-100"
                    :title="t('changes.discardFile')"
                    :aria-label="t('changes.discardFile')"
                    :disabled="busy || change.status === 'conflicted'"
                    data-testid="discard-file"
                    @click="discardTarget = [change]"
                  >
                    <WIcon name="undo-2" size="3.5" />
                  </button>
                  <button
                    type="button"
                    class="flex size-6 shrink-0 items-center justify-center rounded text-faint opacity-0 hover:bg-surface-2 hover:text-1 focus-visible:opacity-100 group-hover/row:opacity-100"
                    :title="t('changes.stageFile')"
                    :aria-label="t('changes.stageFile')"
                    :disabled="busy"
                    data-testid="stage-file"
                    @click="changes.stage([change.path])"
                  >
                    <WIcon name="plus" size="3.5" />
                  </button>
                </template>
              </div>
            </section>
          </div>
        </template>

        <!-- Comparando com outra base: só leitura. -->
        <div v-else class="py-2">
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
        </div>
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

          <FileDiffView v-else-if="diff" :diff="diff" />
        </template>
        <p v-else class="font-inter text-xs text-faint">{{ t("changes.pickFile") }}</p>
      </section>
    </div>

    <WModal
      :open="discardTarget !== null"
      :title="t('changes.discardTitle')"
      @close="discardTarget = null"
    >
      <div class="flex flex-col gap-2 font-inter text-sm text-1" data-testid="discard-confirm">
        <p>{{ t("changes.discardBody") }}</p>
        <ul class="max-h-48 overflow-y-auto rounded-md border border-subtle bg-surface-2 px-2 py-1">
          <li
            v-for="change in discardTarget ?? []"
            :key="change.path"
            class="truncate font-mono text-[12px] text-muted"
          >
            {{ change.path }}
          </li>
        </ul>
        <p v-if="discardDeletes.length" class="text-status-5xx">
          {{ t("changes.discardDeletes", { count: discardDeletes.length }) }}
        </p>
        <p v-if="discardDirtyTabs.length" class="text-status-4xx">
          {{ t("changes.discardDirtyTabs", { names: discardDirtyTabs.join(", ") }) }}
        </p>
      </div>
      <template #footer>
        <WButton variant="ghost" @click="discardTarget = null">{{ t("common.cancel") }}</WButton>
        <WButton variant="danger" data-testid="discard-confirm-button" @click="confirmDiscard">
          {{ t("changes.discardConfirm") }}
        </WButton>
      </template>
    </WModal>
  </div>
</template>

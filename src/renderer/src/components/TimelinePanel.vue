<script setup lang="ts">
import { formatRelativeTime } from "@renderer/lib/format";
import { useTimelineStore } from "@renderer/stores/timeline";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import FileDiffView from "./FileDiffView.vue";
import WButton from "./WButton.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WModal from "./WModal.vue";

/**
 * Aba Timeline (ClickLocal #55): a história de uma request, pasta/collection ou environment
 * commit a commit, o diff campo a campo de cada um, e "Restore this version".
 */

const { t, locale } = useI18n();
const timeline = useTimelineStore();
const { target, log, entries, loading, error, selected, selectedHash, compare, diff, loadingDiff } =
  storeToRefs(timeline);

const STATUS_CLASS: Record<string, string> = {
  added: "text-status-2xx",
  modified: "text-status-4xx",
  deleted: "text-status-5xx",
  renamed: "text-status-3xx",
};

const COMPARE_MODES = ["parent", "current"] as const;

const restoreTitle = computed(() => selected.value?.shortHash ?? "");

function relative(date: string): string {
  return formatRelativeTime(date, locale.value);
}
</script>

<template>
  <div class="flex min-h-0 flex-col overflow-hidden bg-surface-1" data-testid="timeline-panel">
    <header class="flex shrink-0 items-center gap-3 border-b border-subtle px-4 py-2">
      <WIcon name="history" size="4" class="text-faint" />
      <h2 class="font-barlow text-base font-semibold text-1">{{ t("timeline.title") }}</h2>
      <span class="min-w-0 truncate font-mono text-[13px] text-muted" :title="target?.file">
        {{ target?.label }}
      </span>
      <span v-if="entries.length" class="font-inter text-xs text-faint">
        {{ t("timeline.count", { count: entries.length }) }}
      </span>
      <span class="flex-1" />
      <WButton
        size="sm"
        variant="ghost"
        :title="t('timeline.refresh')"
        :aria-label="t('timeline.refresh')"
        @click="timeline.load()"
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
      v-if="!target"
      :title="t('timeline.noTarget.title')"
      :description="t('timeline.noTarget.description')"
    />
    <WEmptyState
      v-else-if="log && !log.available"
      :title="t('timeline.noGit.title')"
      :description="t('timeline.noGit.description')"
    />
    <WEmptyState
      v-else-if="log && !log.inRepository"
      :title="t('timeline.noRepo.title')"
      :description="t('timeline.noRepo.description')"
    />
    <WEmptyState
      v-else-if="log && !loading && entries.length === 0"
      :title="t('timeline.empty.title')"
      :description="t('timeline.empty.description')"
    >
      <template #icon>
        <WIcon name="git-commit-horizontal" size="5" />
      </template>
    </WEmptyState>

    <div v-else-if="log" class="flex min-h-0 flex-1">
      <nav
        class="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-subtle"
        :aria-label="t('timeline.listLabel')"
        data-testid="timeline-list"
      >
        <button
          v-for="entry in entries"
          :key="entry.hash"
          type="button"
          class="flex flex-col gap-0.5 border-b border-subtle px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          :class="
            selectedHash === entry.hash ? 'bg-surface-3 text-1' : 'text-muted hover:bg-surface-3/50'
          "
          :aria-current="selectedHash === entry.hash ? 'true' : undefined"
          data-testid="timeline-row"
          @click="timeline.select(entry.hash)"
        >
          <span class="truncate font-inter text-xs font-medium text-1">{{ entry.subject }}</span>
          <span class="flex items-center gap-2 font-inter text-[11px] text-faint">
            <span class="font-mono">{{ entry.shortHash }}</span>
            <span class="min-w-0 truncate">{{ entry.author }}</span>
            <span class="shrink-0" :title="new Date(entry.date).toLocaleString()">
              {{ relative(entry.date) }}
            </span>
          </span>
          <span
            v-if="entry.status === 'renamed'"
            class="truncate font-mono text-[11px] text-status-3xx"
            :title="entry.from"
          >
            {{ t("timeline.renamedFrom", { from: entry.from }) }}
          </span>
        </button>
        <p v-if="log.truncated" class="px-3 py-2 font-inter text-xs text-faint">
          {{ t("timeline.truncated", { count: entries.length }) }}
        </p>
      </nav>

      <section class="min-w-0 flex-1 overflow-y-auto p-4" data-testid="timeline-diff">
        <template v-if="selected">
          <div class="mb-3 flex flex-wrap items-center gap-3">
            <span
              class="font-mono text-[11px] font-semibold"
              :class="STATUS_CLASS[selected.status]"
            >
              {{ t(`timeline.status.${selected.status}`) }}
            </span>
            <span class="font-mono text-[13px] text-1">{{ selected.shortHash }}</span>
            <span class="min-w-0 truncate font-inter text-xs text-muted">{{
              selected.subject
            }}</span>
            <span class="flex-1" />
            <div
              class="flex rounded-md border border-subtle p-0.5"
              role="group"
              :aria-label="t('timeline.compareLabel')"
            >
              <button
                v-for="mode in COMPARE_MODES"
                :key="mode"
                type="button"
                class="rounded px-2 py-0.5 font-inter text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
                :class="compare === mode ? 'bg-surface-3 text-1' : 'text-muted hover:text-1'"
                :aria-pressed="compare === mode"
                :data-testid="`timeline-compare-${mode}`"
                @click="timeline.setCompare(mode)"
              >
                {{ t(`timeline.compare.${mode}`) }}
              </button>
            </div>
            <WButton
              size="sm"
              variant="secondary"
              :disabled="timeline.restoring || selected.status === 'deleted'"
              :title="selected.status === 'deleted' ? t('timeline.restoreDeleted') : undefined"
              data-testid="timeline-restore"
              @click="timeline.restore(selected)"
            >
              <WIcon name="undo-2" />
              {{ t("timeline.restore") }}
            </WButton>
          </div>
          <p class="mb-3 font-inter text-xs text-faint">
            {{ t(`timeline.compareHint.${compare}`, { hash: selected.shortHash }) }}
          </p>

          <p v-if="loadingDiff" class="font-inter text-xs text-faint">{{ t("changes.loading") }}</p>
          <FileDiffView v-else-if="diff" :diff="diff" />
        </template>
        <p v-else class="font-inter text-xs text-faint">{{ t("timeline.pickCommit") }}</p>
      </section>
    </div>

    <WModal
      :open="timeline.pendingRestore !== null"
      :title="t('timeline.confirmTitle', { hash: restoreTitle })"
      @close="timeline.cancelRestore()"
    >
      <div class="flex flex-col gap-2 font-inter text-sm text-1" data-testid="restore-confirm">
        <p>{{ t("timeline.confirmBody") }}</p>
        <p class="text-status-4xx">
          {{
            t("timeline.confirmDirty", {
              names: timeline.dirtyTabs.map(tab => tab.title).join(", "),
            })
          }}
        </p>
      </div>
      <template #footer>
        <WButton variant="ghost" @click="timeline.cancelRestore()">{{
          t("common.cancel")
        }}</WButton>
        <WButton
          variant="danger"
          data-testid="restore-confirm-button"
          @click="timeline.confirmRestore()"
        >
          {{ t("timeline.confirmRestore") }}
        </WButton>
      </template>
    </WModal>
  </div>
</template>

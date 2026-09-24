<script setup lang="ts">
import type { RunRequestResult } from "@shared";

import { formatDuration } from "@renderer/lib/format";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { useRunnerStore } from "@renderer/stores/runner";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WInput from "./WInput.vue";
import WMethodBadge from "./WMethodBadge.vue";
import WSelect from "./WSelect.vue";
import WStatusBadge from "./WStatusBadge.vue";

/**
 * Collection Runner (EP-13-T01): à esquerda o que rodar (lista na ordem da pasta, que dá
 * para desmarcar e reordenar só para esta execução) e como; à direita o progresso e o
 * relatório por request e por asserção.
 */

const { t } = useI18n();
const runner = useRunnerStore();
const environment = useEnvironmentStore();
const {
  items,
  environmentPath,
  iterations,
  delayMs,
  bail,
  persistVariables,
  running,
  results,
  summary,
  error,
  status,
} = storeToRefs(runner);

const environmentOptions = computed(() => [
  { value: "", label: t("runner.noEnvironment") },
  ...environment.items.map(item => ({ value: item.path, label: item.data.name })),
]);
const environmentValue = computed({
  get: () => environmentPath.value ?? "",
  set: value => (environmentPath.value = value || null),
});

const iterationsText = computed({
  get: () => String(iterations.value),
  set: value => (iterations.value = Number.parseInt(value, 10) || 1),
});
const delayText = computed({
  get: () => String(delayMs.value),
  set: value => (delayMs.value = Number.parseInt(value, 10) || 0),
});

const title = computed(() =>
  runner.targetPath === ""
    ? t("runner.titleWorkspace")
    : t("runner.title", { name: runner.targetName }),
);

// --- Reordenar por arrastar (os botões ↑/↓ cobrem teclado) -----------------------------
const dragIndex = ref<number | null>(null);

function onDrop(index: number): void {
  if (dragIndex.value !== null) runner.move(dragIndex.value, index);
  dragIndex.value = null;
}

// --- Resultados -----------------------------------------------------------------------
const expanded = ref<Set<string>>(new Set());

function resultKey(result: RunRequestResult): string {
  return `${result.iteration}:${result.index}`;
}

function toggleExpanded(result: RunRequestResult): void {
  const key = resultKey(result);
  const next = new Set(expanded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expanded.value = next;
}

const multipleIterations = computed(() => runner.totalSteps > runner.selectedCount);

const endedEarlyLabel = computed(() => {
  if (summary.value?.endedEarly === "stopped") return t("runner.stopped");
  if (summary.value?.endedEarly === "bail") return t("runner.bailed");
  return "";
});

function resultIcon(result: RunRequestResult): string {
  if (result.cancelled) return "circle-slash";
  return result.passed ? "circle-check" : "circle-x";
}

function resultIconClass(result: RunRequestResult): string {
  if (result.cancelled) return "text-faint";
  return result.passed ? "text-status-2xx" : "text-status-5xx";
}
</script>

<template>
  <div class="flex min-h-0 flex-col overflow-hidden bg-surface-1" data-testid="runner-panel">
    <header class="flex shrink-0 items-center gap-3 border-b border-subtle px-4 py-2">
      <WIcon name="list-checks" size="4" class="text-faint" />
      <h2 class="min-w-0 flex-1 truncate font-barlow text-base font-semibold text-1">
        {{ title }}
      </h2>
      <WButton v-if="running" variant="danger" data-testid="runner-stop" @click="runner.stop()">
        <WIcon name="square" />
        {{ t("runner.stop") }}
      </WButton>
      <WButton
        v-else
        variant="primary"
        :disabled="runner.selectedCount === 0"
        data-testid="runner-run"
        @click="runner.start()"
      >
        <WIcon name="play" />
        {{
          runner.selectedCount === 1
            ? t("runner.runOne")
            : t("runner.runOther", { count: runner.selectedCount })
        }}
      </WButton>
    </header>

    <div class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
      <!-- Configuração + lista -->
      <section class="flex min-h-0 flex-col gap-3 border-subtle p-4 lg:overflow-y-auto lg:border-r">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label class="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <span class="font-inter text-xs text-muted">{{ t("runner.environment") }}</span>
            <WSelect v-model="environmentValue" :options="environmentOptions" :disabled="running" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-inter text-xs text-muted">{{ t("runner.iterations") }}</span>
            <WInput v-model="iterationsText" type="number" :disabled="running" monospace />
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-inter text-xs text-muted">{{ t("runner.delay") }}</span>
            <WInput v-model="delayText" type="number" :disabled="running" monospace />
          </label>
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <label class="flex items-center gap-2 font-inter text-sm text-1">
            <input
              v-model="bail"
              type="checkbox"
              class="size-3.5 accent-accent"
              :disabled="running"
            />
            {{ t("runner.bail") }}
          </label>
          <label
            class="flex items-center gap-2 font-inter text-sm text-1"
            :title="t('runner.persistHint')"
          >
            <input
              v-model="persistVariables"
              type="checkbox"
              class="size-3.5 accent-accent"
              :disabled="running"
            />
            {{ t("runner.persist") }}
          </label>
        </div>

        <p
          v-if="runner.unsavedSelected.length > 0"
          class="flex items-start gap-1.5 rounded-md bg-status-4xx/10 px-2 py-1 font-inter text-xs text-status-4xx"
          data-testid="runner-unsaved"
        >
          <WIcon name="triangle-alert" size="3.5" class="mt-px shrink-0" />
          {{
            t("runner.unsaved", {
              names: runner.unsavedSelected.map(item => item.name).join(", "),
            })
          }}
        </p>

        <div class="flex items-center gap-2 border-b border-subtle pb-1">
          <span class="flex-1 font-inter text-xs font-medium text-muted">
            {{ t("runner.selected", { selected: runner.selectedCount, total: items.length }) }}
          </span>
          <WButton
            size="sm"
            variant="ghost"
            :disabled="running"
            @click="runner.setAllSelected(true)"
          >
            {{ t("runner.selectAll") }}
          </WButton>
          <WButton
            size="sm"
            variant="ghost"
            :disabled="running"
            @click="runner.setAllSelected(false)"
          >
            {{ t("runner.selectNone") }}
          </WButton>
        </div>

        <WEmptyState
          v-if="items.length === 0"
          :title="t('runner.empty.title')"
          :description="t('runner.empty.description')"
        />
        <ol v-else class="flex flex-col" data-testid="runner-items">
          <li
            v-for="(item, index) in items"
            :key="item.path"
            class="group flex h-7 items-center gap-2 rounded-md px-1 hover:bg-surface-3"
            :class="{
              'opacity-50': !item.selected,
              'bg-surface-3': runner.current?.path === item.path,
            }"
            :draggable="!running"
            @dragstart="dragIndex = index"
            @dragover.prevent
            @drop="onDrop(index)"
          >
            <WIcon name="grip-vertical" size="3" class="shrink-0 cursor-grab text-faint" />
            <input
              v-model="item.selected"
              type="checkbox"
              class="size-3.5 shrink-0 accent-accent"
              :disabled="running"
              :aria-label="t('runner.include', { name: item.name })"
            />
            <WMethodBadge :method="item.method" class="w-12 shrink-0 text-[11px]" />
            <span class="min-w-0 flex-1 truncate font-inter text-xs text-1">{{ item.name }}</span>
            <span class="hidden min-w-0 truncate font-mono text-[11px] text-faint xl:inline">
              {{ item.path }}
            </span>
            <button
              type="button"
              class="flex size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-2 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-30"
              :disabled="running || index === 0"
              :aria-label="t('runner.moveUp', { name: item.name })"
              @click="runner.move(index, index - 1)"
            >
              <WIcon name="chevron-up" size="3.5" />
            </button>
            <button
              type="button"
              class="flex size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-2 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-30"
              :disabled="running || index === items.length - 1"
              :aria-label="t('runner.moveDown', { name: item.name })"
              @click="runner.move(index, index + 1)"
            >
              <WIcon name="chevron-down" size="3.5" />
            </button>
          </li>
        </ol>
      </section>

      <!-- Resultados -->
      <section
        class="flex min-h-0 flex-col gap-3 p-4 lg:overflow-y-auto"
        data-testid="runner-results"
      >
        <p
          v-if="status === 'failed' && error"
          class="rounded-md bg-status-5xx/10 px-3 py-2 font-inter text-sm text-status-5xx"
        >
          {{ t("runner.failedToStart", { message: error.message }) }}
        </p>

        <WEmptyState
          v-else-if="status === 'idle'"
          :title="t('runner.noResults.title')"
          :description="t('runner.noResults.description')"
        >
          <template #icon>
            <WIcon name="list-checks" size="5" />
          </template>
        </WEmptyState>

        <template v-else>
          <div class="flex flex-col gap-2">
            <div
              class="h-1.5 overflow-hidden rounded-full bg-surface-3"
              role="progressbar"
              :aria-valuenow="Math.round(runner.progress * 100)"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                class="h-full bg-accent transition-all"
                :style="{ width: `${runner.progress * 100}%` }"
              />
            </div>
            <div
              class="flex flex-wrap items-center gap-x-4 gap-y-1 font-inter text-sm"
              data-testid="runner-summary"
            >
              <span class="text-muted">
                {{ t("runner.progress", { done: results.length, total: runner.totalSteps }) }}
              </span>
              <template v-if="summary">
                <span class="flex items-center gap-1 text-status-2xx">
                  <WIcon name="circle-check" /> {{ t("runner.passed", { count: summary.passed }) }}
                </span>
                <span
                  class="flex items-center gap-1"
                  :class="summary.failed ? 'text-status-5xx' : 'text-muted'"
                >
                  <WIcon name="circle-x" /> {{ t("runner.failed", { count: summary.failed }) }}
                </span>
                <span class="text-muted">
                  {{
                    t("runner.assertions", {
                      passed: summary.assertions.passed,
                      total: summary.assertions.total,
                    })
                  }}
                </span>
                <span class="font-mono text-[13px] text-muted">{{
                  formatDuration(summary.durationMs)
                }}</span>
                <span v-if="endedEarlyLabel" class="text-status-4xx">{{ endedEarlyLabel }}</span>
              </template>
              <span v-else-if="running" class="flex items-center gap-1 text-muted">
                <WIcon name="loader-circle" class="animate-spin" /> {{ t("runner.running") }}
              </span>
            </div>
          </div>

          <ol class="flex flex-col">
            <li
              v-for="result in results"
              :key="resultKey(result)"
              class="border-b border-subtle last:border-b-0"
            >
              <button
                type="button"
                class="flex h-7 w-full items-center gap-2 rounded-md px-1 text-left hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                :aria-expanded="expanded.has(resultKey(result))"
                @click="toggleExpanded(result)"
              >
                <WIcon
                  :name="resultIcon(result)"
                  size="3.5"
                  class="shrink-0"
                  :class="resultIconClass(result)"
                />
                <span v-if="multipleIterations" class="shrink-0 font-mono text-[11px] text-faint">
                  #{{ result.iteration }}
                </span>
                <WMethodBadge :method="result.method" class="w-12 shrink-0 text-[11px]" />
                <span class="min-w-0 flex-1 truncate font-inter text-xs text-1">{{
                  result.name
                }}</span>
                <span
                  v-if="result.assertions.length"
                  class="shrink-0 font-inter text-[11px] text-faint"
                >
                  {{
                    t("runner.resultAssertions", {
                      passed: result.assertions.filter(a => a.passed).length,
                      total: result.assertions.length,
                    })
                  }}
                </span>
                <WStatusBadge v-if="!result.cancelled" :code="result.status" class="shrink-0" />
                <span class="w-14 shrink-0 text-right font-mono text-[11px] text-faint">
                  {{ formatDuration(result.durationMs) }}
                </span>
              </button>
              <div
                v-if="expanded.has(resultKey(result))"
                class="flex flex-col gap-1 pb-2 pl-8 pr-2"
              >
                <p class="truncate font-mono text-[11px] text-faint" :title="result.url">
                  {{ result.url }}
                </p>
                <p v-if="result.cancelled" class="font-inter text-xs text-muted">
                  {{ t("runner.cancelled") }}
                </p>
                <p v-if="result.error" class="font-inter text-xs text-status-5xx">
                  <template v-if="result.error.source">{{ result.error.source }}: </template
                  >{{ result.error.error.message }}
                </p>
                <p v-if="result.unresolved.length" class="font-inter text-xs text-status-4xx">
                  {{ t("runner.unresolved", { names: result.unresolved.join(", ") }) }}
                </p>
                <p
                  v-if="!result.assertions.length && !result.error && !result.cancelled"
                  class="font-inter text-xs text-faint"
                >
                  {{ t("runner.noAssertions") }}
                </p>
                <ul class="flex flex-col gap-0.5">
                  <li
                    v-for="(assertion, i) in result.assertions"
                    :key="i"
                    class="flex items-start gap-1.5 font-inter text-xs"
                  >
                    <WIcon
                      :name="assertion.passed ? 'check' : 'x'"
                      size="3"
                      class="mt-0.5 shrink-0"
                      :class="assertion.passed ? 'text-status-2xx' : 'text-status-5xx'"
                    />
                    <span class="text-1">{{ assertion.name }}</span>
                    <span v-if="assertion.message" class="text-status-5xx"
                      >— {{ assertion.message }}</span
                    >
                    <span class="ml-auto shrink-0 text-faint">{{ assertion.source }}</span>
                  </li>
                </ul>
              </div>
            </li>
          </ol>
        </template>
      </section>
    </div>
  </div>
</template>

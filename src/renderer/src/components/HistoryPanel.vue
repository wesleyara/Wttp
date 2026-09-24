<script setup lang="ts">
import type { HistoryEntry } from "@shared";

import { isTextual } from "@renderer/lib/content-type";
import { formatBytes, formatDuration } from "@renderer/lib/format";
import { describeRequestError } from "@renderer/lib/response-error";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import HistoryCompare from "./HistoryCompare.vue";
import WButton from "./WButton.vue";
import WCodeEditor from "./WCodeEditor.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WMethodBadge from "./WMethodBadge.vue";
import WStatusBadge from "./WStatusBadge.vue";

/**
 * Aba History do painel de resposta (EP-08.1-T04) — lista as execuções anteriores da
 * request ativa (`useHistoryStore`, por sua vez lendo `.wttp/history/<slug>.json`,
 * EP-08.1-T03) e, ao clicar numa, mostra a resposta daquela execução aqui mesmo, sem
 * tocar `lastResult`/`scriptRun` da execução atual — "voltar" só limpa a seleção local.
 */
const { t } = useI18n();

const props = defineProps<{
  entries: HistoryEntry[];
}>();

const emit = defineEmits<{
  clear: [];
}>();

const selected = ref<HistoryEntry | null>(null);

// --- Comparar duas execuções (ClickLocal #49) -----------------------------------------
const checked = ref<string[]>([]);
const comparing = ref<{ before: HistoryEntry; after: HistoryEntry } | null>(null);

function toggleChecked(id: string): void {
  checked.value = checked.value.includes(id)
    ? checked.value.filter(item => item !== id)
    : [...checked.value, id].slice(-2);
}

/** Sempre da mais antiga para a mais nova, não importa a ordem em que foram marcadas. */
function compare(a: HistoryEntry, b: HistoryEntry): void {
  comparing.value = a.at <= b.at ? { before: a, after: b } : { before: b, after: a };
}

function compareChecked(): void {
  const [a, b] = props.entries.filter(entry => checked.value.includes(entry.id));
  if (a && b) compare(a, b);
}

// Trocar de aba (o pai já recarrega `entries` por `path`) não deve deixar uma entrada
// da request anterior selecionada.
watch(
  () => props.entries,
  () => {
    selected.value = null;
    comparing.value = null;
    checked.value = [];
  },
);

function selectEntry(entry: HistoryEntry): void {
  selected.value = entry;
}

function backToList(): void {
  selected.value = null;
}

const selectedContentType = computed(() => {
  const res = selected.value?.response;
  if (!res?.ok) return "";
  return res.headers.find(h => h.name.toLowerCase() === "content-type")?.value ?? "";
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <WEmptyState
      v-if="entries.length === 0"
      :title="t('history.empty.title')"
      :description="t('history.empty.description')"
    >
      <template #icon>
        <WIcon name="history" size="5" />
      </template>
    </WEmptyState>

    <HistoryCompare
      v-else-if="comparing"
      :before="comparing.before"
      :after="comparing.after"
      @back="comparing = null"
    />

    <template v-else-if="!selected">
      <div class="flex h-8 shrink-0 items-center justify-end gap-1 border-b border-subtle px-2">
        <span v-if="entries.length > 1" class="mr-auto font-inter text-[11px] text-faint">
          {{ t("history.compare.pickTwo") }}
        </span>
        <WButton
          v-if="entries.length > 1"
          size="sm"
          variant="ghost"
          :disabled="checked.length !== 2"
          data-testid="history-compare-button"
          @click="compareChecked"
        >
          <WIcon name="git-compare" size="3.5" />
          {{ t("history.compare.compareSelected", { count: checked.length }) }}
        </WButton>
        <WButton size="sm" variant="ghost" @click="emit('clear')">
          {{ t("history.clear") }}
        </WButton>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div
          v-for="(entry, index) in entries"
          :key="entry.id"
          class="flex h-8 items-center border-b border-subtle pl-2 hover:bg-surface-3/50"
          data-testid="history-row"
        >
          <input
            v-if="entries.length > 1"
            type="checkbox"
            class="size-3.5 shrink-0 accent-accent"
            :checked="checked.includes(entry.id)"
            :aria-label="
              t('history.compare.pick', { time: new Date(entry.at).toLocaleTimeString() })
            "
            @change="toggleChecked(entry.id)"
          />
          <button
            type="button"
            class="flex h-full min-w-0 flex-1 items-center gap-3 px-2 text-left font-mono text-[13px]"
            @click="selectEntry(entry)"
          >
            <WStatusBadge
              :code="entry.response.ok ? entry.response.status : null"
              class="w-10 shrink-0"
            />
            <WMethodBadge :method="entry.request.method" class="w-10 shrink-0" />
            <span class="flex-1 truncate text-muted">{{ entry.request.url }}</span>
            <span v-if="entry.response.ok" class="w-16 shrink-0 text-right text-faint">
              {{ formatDuration(entry.response.timing.total) }}
            </span>
            <span v-if="entry.response.ok" class="w-16 shrink-0 text-right text-faint">
              {{ formatBytes(entry.response.size.bodyReceived) }}
            </span>
            <span class="w-24 shrink-0 whitespace-nowrap text-right text-faint">
              {{ new Date(entry.at).toLocaleTimeString() }}
            </span>
          </button>
          <button
            v-if="index === 0 && entries.length > 1"
            type="button"
            class="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            :title="t('history.compare.withPrevious')"
            :aria-label="t('history.compare.withPrevious')"
            data-testid="history-compare-previous"
            @click="compare(entries[1], entry)"
          >
            <WIcon name="git-compare" size="3.5" />
          </button>
          <span v-else-if="entries.length > 1" class="mr-1 size-6 shrink-0" />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex h-8 shrink-0 items-center gap-2 border-b border-subtle px-2">
        <WButton size="sm" variant="ghost" @click="backToList">
          <WIcon name="arrow-left" size="3.5" />
          {{ t("history.back") }}
        </WButton>
        <span class="font-inter text-xs text-faint">
          {{ new Date(selected.at).toLocaleString() }}
        </span>
      </div>

      <div
        v-if="!selected.response.ok"
        class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
      >
        <WStatusBadge :code="null" />
        <p class="font-barlow text-base font-semibold text-1">{{ selected.response.error.code }}</p>
        <p class="max-w-md font-inter text-sm text-muted">
          {{ describeRequestError(selected.response.error.code) }}
        </p>
      </div>

      <template v-else>
        <div class="flex h-9 shrink-0 items-center gap-4 border-b border-subtle px-3">
          <WStatusBadge :code="selected.response.status" />
          <span class="font-mono text-[13px] text-muted">
            {{ formatDuration(selected.response.timing.total) }}
          </span>
          <span class="font-mono text-[13px] text-muted">
            {{ formatBytes(selected.response.size.bodyReceived) }}
          </span>
        </div>

        <p
          v-if="selected.response.bodyTruncated"
          class="mx-2 mt-2 shrink-0 rounded-md bg-status-3xx/10 px-2 py-1 font-inter text-xs text-status-3xx"
        >
          {{ t("history.bodyTruncated") }}
        </p>

        <div class="min-h-0 flex-1">
          <WCodeEditor
            v-if="isTextual(selectedContentType)"
            :model-value="selected.response.body"
            language="text"
            read-only
            line-wrap
          />
          <WEmptyState
            v-else
            :title="t('history.binary.title')"
            :description="t('history.binary.description')"
          >
            <template #icon>
              <WIcon name="file-box" size="5" />
            </template>
          </WEmptyState>
        </div>
      </template>
    </template>
  </div>
</template>

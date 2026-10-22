<script setup lang="ts">
import { useRequestStore } from "@renderer/stores/request";
import {
  filterLog,
  useWebSocketStore,
  type WebSocketDirectionFilter,
} from "@renderer/stores/websocket";
import { storeToRefs } from "pinia";
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WInput from "./WInput.vue";

const { t } = useI18n();
const request = useRequestStore();
const { websocket } = storeToRefs(request);
const ws = useWebSocketStore();

const tabId = computed(() => request.tabId);
const session = computed(() => ws.sessionFor(tabId.value));
const visible = computed(() =>
  filterLog(session.value.log, session.value.filterText, session.value.filterDirection),
);

const DIRECTIONS: WebSocketDirectionFilter[] = ["all", "out", "in"];
const directionLabels = computed<Record<WebSocketDirectionFilter, string>>(() => ({
  all: t("websocket.messages.all"),
  out: t("websocket.messages.sent"),
  in: t("websocket.messages.received"),
}));

// --- Lista: acompanha o fim enquanto o usuário não rolou para cima ------------------
const listRef = useTemplateRef<HTMLElement>("list");
const stickToBottom = ref(true);
const expanded = ref(new Set<number>());

function onScroll(): void {
  const el = listRef.value;
  if (!el) return;
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
}

watch(
  () => visible.value.length,
  async () => {
    if (!stickToBottom.value) return;
    await nextTick();
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
);

function toggleExpanded(id: number): void {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function timeOf(at: number): string {
  const date = new Date(at);
  const pad = (n: number, size = 2): string => String(n).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function copy(data: string): void {
  void navigator.clipboard.writeText(data);
}

// --- Compositor ---------------------------------------------------------------------
const format = computed<"text" | "json">({
  get: () => websocket.value.message?.format ?? "text",
  set: value => {
    websocket.value = {
      ...websocket.value,
      message: { ...websocket.value.message, format: value },
    };
  },
});

const draft = computed<string>({
  get: () => websocket.value.message?.content ?? "",
  set: value => {
    websocket.value = {
      ...websocket.value,
      message: { ...websocket.value.message, content: value },
    };
  },
});

const jsonError = computed(() => {
  if (format.value !== "json" || draft.value.trim() === "") return false;
  try {
    JSON.parse(draft.value);
    return false;
  } catch {
    return true;
  }
});

const connected = computed(() => session.value.state === "open");
const canSend = computed(() => connected.value && draft.value !== "" && !jsonError.value);

async function onSend(): Promise<void> {
  if (!canSend.value) return;
  // JSON sai compacto: o rascunho continua formatado como o usuário escreveu.
  const payload = format.value === "json" ? JSON.stringify(JSON.parse(draft.value)) : draft.value;
  await ws.send(tabId.value, payload);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void onSend();
  }
}

const directionClass: Record<string, string> = {
  in: "text-status-2xx",
  out: "text-accent",
  system: "text-faint",
};
const directionIcon: Record<string, string> = {
  in: "arrow-down-left",
  out: "arrow-up-right",
  system: "info",
};
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="websocket-panel">
    <div class="flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-2">
      <span class="font-barlow text-sm font-semibold text-1">{{
        t("websocket.messages.title")
      }}</span>
      <span class="whitespace-nowrap font-inter text-xs text-faint">
        {{ t("websocket.messages.count", { shown: visible.length, total: session.log.length }) }}
      </span>
      <div class="ml-auto flex items-center gap-2">
        <div class="flex rounded-md border border-subtle" role="group">
          <button
            v-for="direction in DIRECTIONS"
            :key="direction"
            type="button"
            class="px-2 py-1 font-inter text-xs transition-colors first:rounded-l-md last:rounded-r-md"
            :class="
              session.filterDirection === direction
                ? 'bg-surface-3 text-1'
                : 'text-muted hover:bg-surface-3'
            "
            :data-testid="`websocket-filter-${direction}`"
            @click="session.filterDirection = direction"
          >
            {{ directionLabels[direction] }}
          </button>
        </div>
        <WInput
          v-model="session.filterText"
          class="w-40 min-w-0"
          :placeholder="t('websocket.messages.filterPlaceholder')"
          data-testid="websocket-filter-text"
        />
        <WButton size="sm" variant="ghost" @click="ws.clearLog(tabId)">
          <WIcon name="trash-2" /> {{ t("websocket.messages.clear") }}
        </WButton>
      </div>
    </div>

    <div
      ref="list"
      class="min-h-0 flex-1 overflow-y-auto"
      data-testid="websocket-log"
      @scroll="onScroll"
    >
      <WEmptyState
        v-if="session.log.length === 0"
        :title="t('websocket.messages.emptyTitle')"
        :description="t('websocket.messages.emptyDescription')"
      />
      <p v-else-if="visible.length === 0" class="p-4 font-inter text-sm text-muted">
        {{ t("websocket.messages.noMatches") }}
      </p>
      <ul v-else class="flex flex-col">
        <li
          v-for="entry in visible"
          :key="entry.id"
          class="group flex items-start gap-2 border-b border-subtle px-3 py-1.5"
          :data-testid="`websocket-entry-${entry.direction}`"
        >
          <WIcon
            :name="directionIcon[entry.direction]"
            size="4"
            class="mt-0.5"
            :class="directionClass[entry.direction]"
          />
          <span class="mt-0.5 shrink-0 font-mono text-xs text-faint">{{ timeOf(entry.at) }}</span>
          <button
            type="button"
            class="min-w-0 flex-1 text-left font-mono text-xs"
            :class="[
              entry.direction === 'system' ? 'text-muted' : 'text-1',
              expanded.has(entry.id)
                ? 'whitespace-pre-wrap break-all'
                : 'line-clamp-3 whitespace-pre-wrap break-all',
            ]"
            @click="toggleExpanded(entry.id)"
          >
            {{ entry.data }}
          </button>
          <span v-if="entry.direction !== 'system'" class="shrink-0 font-inter text-xs text-faint">
            {{ t("websocket.messages.sizeBytes", { size: entry.size }) }}
          </span>
          <button
            v-if="entry.direction !== 'system'"
            type="button"
            class="shrink-0 text-faint opacity-0 transition-opacity hover:text-1 group-hover:opacity-100"
            :title="t('websocket.messages.copy')"
            :aria-label="t('websocket.messages.copy')"
            @click="copy(entry.data)"
          >
            <WIcon name="copy" size="3.5" />
          </button>
        </li>
      </ul>
    </div>

    <div class="flex flex-col gap-2 border-t border-subtle p-3">
      <textarea
        v-model="draft"
        rows="3"
        spellcheck="false"
        class="w-full resize-y rounded-md border bg-surface-2 p-2 font-mono text-xs text-1 outline-none focus:ring-1 focus:ring-inset focus:ring-focus"
        :class="jsonError ? 'border-status-5xx' : 'border-subtle focus:border-strong'"
        :placeholder="t('websocket.messages.composerPlaceholder')"
        data-testid="websocket-composer"
        @keydown="onKeydown"
      />
      <div class="flex items-center gap-2">
        <div
          class="flex rounded-md border border-subtle"
          role="group"
          :aria-label="t('websocket.messages.format')"
        >
          <button
            v-for="option in ['text', 'json'] as const"
            :key="option"
            type="button"
            class="px-2 py-1 font-inter text-xs transition-colors first:rounded-l-md last:rounded-r-md"
            :class="format === option ? 'bg-surface-3 text-1' : 'text-muted hover:bg-surface-3'"
            :data-testid="`websocket-format-${option}`"
            @click="format = option"
          >
            {{
              option === "text"
                ? t("websocket.messages.formatText")
                : t("websocket.messages.formatJson")
            }}
          </button>
        </div>
        <span v-if="jsonError" class="font-inter text-xs text-status-5xx">
          {{ t("websocket.messages.invalidJson") }}
        </span>
        <WButton
          class="ml-auto"
          variant="primary"
          :disabled="!canSend"
          data-testid="websocket-send"
          @click="onSend"
        >
          <WIcon name="send" /> {{ t("websocket.messages.send") }}
        </WButton>
      </div>
    </div>
  </div>
</template>

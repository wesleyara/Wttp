<script setup lang="ts">
import type { HistoryEntry } from "@shared";

import { diffResponses, HEADER_IGNORE_PREFIX } from "@renderer/lib/responseDiff";
import { useHistoryStore } from "@renderer/stores/history";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WContextMenu, { type ContextMenuItem } from "./WContextMenu.vue";
import WIcon from "./WIcon.vue";

/**
 * Comparação de duas execuções da mesma request (ClickLocal #49) — status, headers e body,
 * com o body JSON comparado por caminho. O que muda sempre (timestamp, request id, `Date`)
 * vai para a lista de ignorados da request, que vale para as próximas comparações também.
 */

const props = defineProps<{
  /** A execução mais antiga — a base. */
  before: HistoryEntry;
  after: HistoryEntry;
}>();

const emit = defineEmits<{ back: [] }>();

const { t } = useI18n();
const history = useHistoryStore();
const ignoreHeaders = ref(false);

const diff = computed(() =>
  diffResponses(props.before, props.after, {
    ignored: history.diffIgnores,
    ignoreHeaders: ignoreHeaders.value,
  }),
);

const nothingChanged = computed(() => {
  const { status, headers, body } = diff.value;
  const bodyChanged =
    body.mode === "json" ? body.changes.length > 0 : body.mode === "text" ? body.changed : false;
  return !status && headers.length === 0 && !bodyChanged;
});

const KIND_CLASS: Record<string, string> = {
  added: "bg-status-2xx/10 text-status-2xx",
  removed: "bg-status-5xx/10 text-status-5xx",
  changed: "bg-status-4xx/10 text-status-4xx",
  typeChanged: "bg-status-4xx/10 text-status-4xx",
};
const LINE_CLASS: Record<string, string> = {
  same: "text-muted",
  added: "bg-status-2xx/10 text-status-2xx",
  removed: "bg-status-5xx/10 text-status-5xx",
};
const LINE_PREFIX: Record<string, string> = { same: " ", added: "+", removed: "−" };

function time(entry: HistoryEntry): string {
  return new Date(entry.at).toLocaleTimeString();
}

function ignoreLabel(pattern: string): string {
  return pattern.startsWith(HEADER_IGNORE_PREFIX)
    ? t("history.compare.headerPattern", { name: pattern.slice(HEADER_IGNORE_PREFIX.length) })
    : pattern;
}

// --- "Ignore this path" pelo clique direito -------------------------------------------
const menu = ref<{ x: number; y: number; pattern: string; copy: string } | null>(null);

function openMenu(event: MouseEvent, pattern: string, copy: string): void {
  event.preventDefault();
  menu.value = { x: event.clientX, y: event.clientY, pattern, copy };
}

const menuItems = computed<ContextMenuItem[]>(() => {
  const target = menu.value;
  if (!target) return [];
  return [
    {
      label: t("history.compare.ignorePath"),
      icon: "eye-off",
      action: () => history.addDiffIgnore(target.pattern),
    },
    {
      label: t("history.compare.copyPath"),
      icon: "copy",
      action: () => void navigator.clipboard.writeText(target.copy),
    },
  ];
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col" data-testid="history-compare">
    <div class="flex h-8 shrink-0 items-center gap-2 border-b border-subtle px-2">
      <WButton size="sm" variant="ghost" @click="emit('back')">
        <WIcon name="arrow-left" size="3.5" />
        {{ t("history.back") }}
      </WButton>
      <span class="min-w-0 flex-1 truncate font-inter text-xs text-faint">
        {{ t("history.compare.range", { before: time(before), after: time(after) }) }}
      </span>
      <label class="flex items-center gap-1.5 font-inter text-xs text-muted">
        <input v-model="ignoreHeaders" type="checkbox" class="size-3.5 accent-accent" />
        {{ t("history.compare.ignoreHeaders") }}
      </label>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <div v-if="history.diffIgnores.length" class="mb-3 flex flex-wrap items-center gap-1">
        <span class="font-inter text-[11px] text-faint">{{ t("history.compare.ignored") }}</span>
        <span
          v-for="pattern in history.diffIgnores"
          :key="pattern"
          class="flex items-center gap-1 rounded bg-surface-3 py-0.5 pl-1.5 pr-0.5 font-mono text-[11px] text-muted"
          data-testid="diff-ignore-chip"
        >
          {{ ignoreLabel(pattern) }}
          <button
            type="button"
            class="flex size-4 items-center justify-center rounded text-faint hover:text-1"
            :aria-label="t('history.compare.unignore', { path: ignoreLabel(pattern) })"
            @click="history.removeDiffIgnore(pattern)"
          >
            <WIcon name="x" size="3" />
          </button>
        </span>
      </div>

      <p
        v-if="diff.truncated"
        class="mb-3 rounded-md bg-status-3xx/10 px-2 py-1 font-inter text-xs text-status-3xx"
      >
        {{ t("history.compare.truncated") }}
      </p>

      <p v-if="nothingChanged" class="font-inter text-sm text-muted" data-testid="diff-nothing">
        {{ t("history.compare.nothing") }}
      </p>

      <section v-if="diff.status" class="mb-4">
        <h4 class="mb-1 font-inter text-xs font-semibold text-1">
          {{ t("history.compare.status") }}
        </h4>
        <p class="font-mono text-[12px]">
          <span class="text-status-5xx line-through">{{ diff.status.before }}</span>
          <span class="mx-1 text-faint">→</span>
          <span class="text-status-2xx">{{ diff.status.after }}</span>
        </p>
      </section>

      <section v-if="diff.headers.length" class="mb-4">
        <h4 class="mb-1 font-inter text-xs font-semibold text-1">
          {{ t("history.compare.headers") }}
        </h4>
        <ul class="flex flex-col gap-1">
          <li
            v-for="header in diff.headers"
            :key="header.name"
            class="group flex flex-wrap items-baseline gap-x-2 font-mono text-[12px]"
            data-testid="diff-header"
            @contextmenu="openMenu($event, `${HEADER_IGNORE_PREFIX}${header.name}`, header.name)"
          >
            <span class="rounded px-1 font-inter text-xs" :class="KIND_CLASS[header.kind]">
              {{ t(`history.compare.kind.${header.kind}`) }}
            </span>
            <span class="text-1">{{ header.name }}</span>
            <span
              v-if="header.before !== undefined"
              class="break-all text-status-5xx"
              :class="{ 'line-through': header.kind === 'changed' }"
            >
              {{ header.before }}
            </span>
            <span v-if="header.kind === 'changed'" class="text-faint">→</span>
            <span v-if="header.after !== undefined" class="break-all text-status-2xx">{{
              header.after
            }}</span>
            <button
              type="button"
              class="ml-auto flex size-5 items-center justify-center self-center rounded text-faint opacity-0 hover:text-1 focus-visible:opacity-100 group-hover:opacity-100"
              :title="t('history.compare.ignorePath')"
              :aria-label="t('history.compare.ignorePath')"
              @click="history.addDiffIgnore(`${HEADER_IGNORE_PREFIX}${header.name}`)"
            >
              <WIcon name="eye-off" size="3" />
            </button>
          </li>
        </ul>
      </section>

      <section v-if="diff.body.mode === 'json' && diff.body.changes.length" class="mb-4">
        <h4 class="mb-1 font-inter text-xs font-semibold text-1">
          {{ t("history.compare.body") }}
        </h4>
        <ul class="flex flex-col gap-1">
          <li
            v-for="change in diff.body.changes"
            :key="change.path"
            class="group flex flex-wrap items-baseline gap-x-2 font-mono text-[12px]"
            data-testid="diff-body-change"
            @contextmenu="openMenu($event, change.path, change.path)"
          >
            <span class="rounded px-1 font-inter text-xs" :class="KIND_CLASS[change.kind]">
              {{ t(`history.compare.kind.${change.kind}`) }}
            </span>
            <span class="text-1">{{ change.path }}</span>
            <span
              v-if="change.before !== undefined"
              class="break-all text-status-5xx"
              :class="{ 'line-through': change.kind !== 'removed' }"
            >
              {{ change.before }}
            </span>
            <span
              v-if="change.before !== undefined && change.after !== undefined"
              class="text-faint"
              >→</span
            >
            <span v-if="change.after !== undefined" class="break-all text-status-2xx">{{
              change.after
            }}</span>
            <button
              type="button"
              class="ml-auto flex size-5 items-center justify-center self-center rounded text-faint opacity-0 hover:text-1 focus-visible:opacity-100 group-hover:opacity-100"
              :title="t('history.compare.ignorePath')"
              :aria-label="t('history.compare.ignorePath')"
              data-testid="diff-ignore-path"
              @click="history.addDiffIgnore(change.path)"
            >
              <WIcon name="eye-off" size="3" />
            </button>
          </li>
        </ul>
      </section>

      <section v-if="diff.body.mode === 'text' && diff.body.changed" class="mb-4">
        <h4 class="mb-1 font-inter text-xs font-semibold text-1">
          {{ t("history.compare.body") }}
        </h4>
        <pre
          class="overflow-x-auto rounded-md border border-subtle bg-surface-2 py-1 font-mono text-[12px]"
        ><div
            v-for="(line, index) in diff.body.lines"
            :key="index"
            class="whitespace-pre px-2"
            :class="LINE_CLASS[line.type]"
          >{{ LINE_PREFIX[line.type] }} {{ line.text }}</div></pre>
      </section>
    </div>

    <WContextMenu
      :open="menu !== null"
      :x="menu?.x ?? 0"
      :y="menu?.y ?? 0"
      :items="menuItems"
      @close="menu = null"
    />
  </div>
</template>

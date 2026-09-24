<script setup lang="ts">
import type {
  ScriptAssertionWithSource,
  ScriptConsoleEntryWithSource,
} from "@renderer/stores/requestTabs";
import type { WttpError } from "@shared";

import { useI18n } from "vue-i18n";

import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";

/**
 * Aba Tests do painel de resposta (EP-09-T05) — asserções passou/falhou com duração e
 * detalhe da falha, e o console de scripts, cada linha já com a fase (`preRequest`/
 * `tests`) e a origem (request/pasta/collection) que `useRequestTabsStore.dispatch`
 * anexou. Reaproveitado tanto no resultado normal quanto no caso de pre-request ter
 * abortado o envio (sem resposta nenhuma para mostrar).
 */
const { t } = useI18n();

defineProps<{
  assertions: ScriptAssertionWithSource[];
  consoleEntries: ScriptConsoleEntryWithSource[];
  preRequestError?: { source: string; error: WttpError };
}>();

const CONSOLE_LEVEL_CLASS: Record<string, string> = {
  log: "text-muted",
  warn: "text-status-3xx",
  error: "text-status-5xx",
};
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pt-2">
    <div
      v-if="preRequestError"
      class="mx-2 flex flex-col gap-1 rounded-md bg-status-5xx/10 px-3 py-2 font-inter text-sm text-status-5xx"
    >
      <p class="font-medium">
        {{ t("scriptResults.preRequestFailed", { source: preRequestError.source }) }}
      </p>
      <p class="font-mono text-xs">{{ preRequestError.error.message }}</p>
      <p class="text-xs text-muted">{{ t("scriptResults.notSent") }}</p>
    </div>

    <WEmptyState
      v-if="assertions.length === 0 && consoleEntries.length === 0 && !preRequestError"
      :title="t('scriptResults.empty.title')"
      :description="t('scriptResults.empty.description')"
    >
      <template #icon>
        <WIcon name="check" size="5" />
      </template>
    </WEmptyState>

    <div v-if="assertions.length > 0" class="flex flex-col gap-1 px-2">
      <p class="font-inter text-xs font-medium text-faint">
        {{
          t("scriptResults.assertions", {
            passed: assertions.filter(a => a.passed).length,
            total: assertions.length,
          })
        }}
      </p>
      <div
        v-for="(assertion, index) in assertions"
        :key="index"
        class="flex flex-col gap-0.5 rounded-md border border-subtle px-2 py-1.5"
      >
        <div class="flex items-center gap-2">
          <WIcon
            :name="assertion.passed ? 'check' : 'x'"
            size="4"
            :class="assertion.passed ? 'text-status-2xx' : 'text-status-5xx'"
          />
          <span class="flex-1 font-inter text-sm text-1">{{ assertion.name }}</span>
          <span class="font-mono text-xs text-faint">{{ assertion.source }}</span>
          <span class="font-mono text-xs text-faint">{{ assertion.durationMs }}ms</span>
        </div>
        <p
          v-if="!assertion.passed && assertion.message"
          class="pl-6 font-mono text-xs text-status-5xx"
        >
          {{ assertion.message }}
        </p>
      </div>
    </div>

    <div v-if="consoleEntries.length > 0" class="flex flex-col gap-1 px-2 pb-2">
      <p class="font-inter text-xs font-medium text-faint">{{ t("scriptResults.console") }}</p>
      <div class="flex flex-col rounded-md border border-subtle">
        <div
          v-for="(entry, index) in consoleEntries"
          :key="index"
          class="flex items-start gap-2 border-b border-subtle px-2 py-1 font-mono text-xs last:border-b-0"
        >
          <span class="w-20 shrink-0 truncate text-faint">{{ entry.phase }}</span>
          <span class="w-24 shrink-0 truncate text-faint">{{ entry.source }}</span>
          <span
            class="flex-1 whitespace-pre-wrap break-all"
            :class="CONSOLE_LEVEL_CLASS[entry.level]"
          >
            {{ entry.message }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

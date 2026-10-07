<script setup lang="ts">
import type { DiffItem } from "@renderer/lib/structuralDiff";
import type { FileDiff } from "@renderer/stores/changes";

import { useI18n } from "vue-i18n";

import WIcon from "./WIcon.vue";

/**
 * Diff de um arquivo do workspace — campo a campo para request/pasta/environment, texto cru
 * quando o YAML não parseia. Usado pela aba Changes (#52) e pela Timeline (#55).
 */

defineProps<{
  diff: FileDiff;
}>();

const { t, te } = useI18n();

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
  <div>
    <template v-if="diff.mode === 'text'">
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

    <template v-else-if="diff.mode === 'fields'">
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
  </div>
</template>

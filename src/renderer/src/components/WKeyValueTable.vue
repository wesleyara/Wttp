<script setup lang="ts">
import { computed, reactive } from "vue";

export interface KeyValueRow {
  enabled: boolean;
  name: string;
  value: string;
  description: string;
  /** Só relevante com `withSecret` (EP-06-T03) — valor mascarado, nunca copiado ao duplicar. */
  secret?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: KeyValueRow[];
    /** Mostra a coluna "Secret" (toggle) e mascara o valor de uma linha marcada como secreta. */
    withSecret?: boolean;
    /** Nomes de `{{var}}` não resolvidos (EP-06-T05) — uma linha cujo valor referencia um deles ganha destaque visual. */
    unresolvedVariables?: string[];
    /** `nome → texto do tooltip`, mesmo formato de `WCodeEditor` — usado no `title` da linha quando ela tem uma variável não resolvida. */
    variableTooltips?: Record<string, string>;
  }>(),
  { withSecret: false, unresolvedVariables: () => [], variableTooltips: () => ({}) },
);

const emit = defineEmits<{
  "update:modelValue": [rows: KeyValueRow[]];
}>();

// Uma linha em branco sempre no fim: digitar nela promove uma linha real.
const rows = computed(() => [...props.modelValue, blankRow()]);

// Índices com o valor secreto temporariamente revelado — nunca persistido, só estado de UI.
const revealed = reactive(new Set<number>());

function blankRow(): KeyValueRow {
  return { enabled: true, name: "", value: "", description: "", secret: false };
}

function toggleReveal(index: number): void {
  if (revealed.has(index)) revealed.delete(index);
  else revealed.add(index);
}

function isMasked(index: number, row: KeyValueRow): boolean {
  return props.withSecret && Boolean(row.secret) && !revealed.has(index);
}

function unresolvedNamesIn(value: string): string[] {
  return props.unresolvedVariables.filter(name =>
    new RegExp(`\\{\\{\\s*${escapeRegExp(name)}\\s*\\}\\}`).test(value),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rowTooltip(row: KeyValueRow): string | undefined {
  const names = unresolvedNamesIn(row.value);
  if (names.length === 0) return undefined;
  return names.map(name => props.variableTooltips[name] ?? `${name} — not resolved`).join("\n");
}

function updateRow(index: number, patch: Partial<KeyValueRow>): void {
  const next = [...props.modelValue];
  if (index === props.modelValue.length) {
    next.push({ ...blankRow(), ...patch });
  } else {
    next[index] = { ...next[index], ...patch };
  }
  emit("update:modelValue", next);
}

function removeRow(index: number): void {
  const next = props.modelValue.filter((_, i) => i !== index);
  emit("update:modelValue", next);
}

/**
 * Colar em massa: cada linha vira uma row, aceitando `name: value`, `name=value` ou
 * `name<tab>value` (headers copiados do DevTools, `.env`, `curl -H`). Colar uma única
 * linha não intercepta — o browser cola normalmente no input.
 */
function parseBulkPaste(text: string): KeyValueRow[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      const match = /^([^:=\t]+)[:=\t]\s*(.*)$/.exec(line);
      return match
        ? [{ enabled: true, name: match[1].trim(), value: match[2].trim(), description: "" }]
        : [];
    });
}

function onPasteName(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData("text/plain") ?? "";
  const parsedRows = parseBulkPaste(text);
  if (parsedRows.length < 2) return;
  event.preventDefault();
  emit("update:modelValue", [...props.modelValue, ...parsedRows]);
}
</script>

<template>
  <div class="flex flex-col">
    <div
      class="flex h-7 items-center gap-2 border-b border-subtle px-2 font-inter text-xs font-medium text-faint"
    >
      <span class="w-5 shrink-0" />
      <span class="w-1/4 shrink-0">Name</span>
      <span class="w-1/4 shrink-0">Value</span>
      <span class="flex-1">Description</span>
      <span v-if="withSecret" class="w-14 shrink-0">Secret</span>
      <span class="w-6 shrink-0" />
    </div>
    <div
      v-for="(row, index) in rows"
      :key="index"
      class="flex h-7 items-center gap-2 border-b border-subtle px-2 last:border-b-0"
    >
      <input
        type="checkbox"
        :checked="row.enabled"
        class="size-3.5 shrink-0 accent-accent"
        :aria-label="`Enable row ${index + 1}`"
        @change="updateRow(index, { enabled: ($event.target as HTMLInputElement).checked })"
      />
      <input
        :value="row.name"
        placeholder="Name"
        class="w-1/4 shrink-0 bg-transparent font-mono text-[13px] text-1 outline-none placeholder:text-faint"
        @input="updateRow(index, { name: ($event.target as HTMLInputElement).value })"
        @paste="onPasteName"
      />
      <span class="flex w-1/4 shrink-0 items-center gap-1">
        <input
          :type="isMasked(index, row) ? 'password' : 'text'"
          :value="row.value"
          placeholder="Value"
          :title="rowTooltip(row)"
          class="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-faint"
          :class="unresolvedNamesIn(row.value).length > 0 ? 'text-status-4xx' : 'text-1'"
          @input="updateRow(index, { value: ($event.target as HTMLInputElement).value })"
        />
        <button
          v-if="withSecret && row.secret"
          type="button"
          :aria-label="revealed.has(index) ? 'Hide value' : 'Reveal value'"
          class="flex size-5 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          @click="toggleReveal(index)"
        >
          <svg class="size-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <circle cx="10" cy="10" r="2" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
      </span>
      <input
        :value="row.description"
        placeholder="Description"
        class="flex-1 bg-transparent font-inter text-sm text-1 outline-none placeholder:text-faint"
        @input="updateRow(index, { description: ($event.target as HTMLInputElement).value })"
      />
      <span v-if="withSecret" class="flex w-14 shrink-0 items-center">
        <input
          type="checkbox"
          :checked="Boolean(row.secret)"
          class="size-3.5 shrink-0 accent-accent"
          :aria-label="`Mark row ${index + 1} as secret`"
          @change="updateRow(index, { secret: ($event.target as HTMLInputElement).checked })"
        />
      </span>
      <button
        v-if="index < modelValue.length"
        type="button"
        aria-label="Remove row"
        class="flex size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        @click="removeRow(index)"
      >
        <svg class="size-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 5l10 10M15 5L5 15"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <span v-else class="w-6 shrink-0" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToastStore } from "@renderer/stores/toast";
import { computed, reactive } from "vue";

import WCodeEditor from "./WCodeEditor.vue";
import WIcon from "./WIcon.vue";

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
    /** Nomes oferecidos no autocomplete de `{{` no campo de valor (EP-06.1). */
    variableNames?: string[];
    /** `false` esconde a linha em branco do fim — usada quando linhas só podem vir de outro lugar (ex: path params, derivados da URL). */
    allowAdd?: boolean;
    /** `false` esconde o botão de remover — mesmo motivo de `allowAdd`. */
    allowRemove?: boolean;
    /** `true` torna o nome só-leitura (texto, não input) — path params são nomeados pela URL, não aqui. */
    readonlyName?: boolean;
    /** `false` esconde o checkbox de habilitar — path params não têm "desabilitado", só existem ou não (controlado pela URL). */
    allowToggle?: boolean;
  }>(),
  {
    withSecret: false,
    unresolvedVariables: () => [],
    variableTooltips: () => ({}),
    variableNames: () => [],
    allowAdd: true,
    allowRemove: true,
    readonlyName: false,
    allowToggle: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [rows: KeyValueRow[]];
}>();

// Uma linha em branco sempre no fim: digitar nela promove uma linha real. Some quando
// `allowAdd` é `false` — linhas derivadas de outro lugar (path params) não se criam aqui.
const rows = computed(() =>
  props.allowAdd ? [...props.modelValue, blankRow()] : props.modelValue,
);

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

function updateRow(index: number, patch: Partial<KeyValueRow>): void {
  const next = [...props.modelValue];
  if (index === props.modelValue.length) {
    const promoted = { ...blankRow(), ...patch };
    // Só promove a linha fantasma quando o patch dá conteúdo real a ela —
    // marcar o checkbox ou digitar na descrição de uma linha ainda vazia
    // não deve criar uma linha persistida vazia.
    if (!promoted.name && !promoted.value) return;
    next.push(promoted);
  } else {
    next[index] = { ...next[index], ...patch };
  }
  emit("update:modelValue", next);
}

const toast = useToastStore();

function removeRow(index: number): void {
  const removed = props.modelValue[index];
  const next = props.modelValue.filter((_, i) => i !== index);
  emit("update:modelValue", next);
  toast.push(removed.name ? `"${removed.name}" removed` : "Row removed", "info", 2000);
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
      class="flex h-8 items-center gap-2 border-b border-subtle px-2 last:border-b-0"
    >
      <input
        v-if="allowToggle"
        type="checkbox"
        :checked="row.enabled"
        class="size-3.5 shrink-0 accent-accent"
        :aria-label="`Enable row ${index + 1}`"
        @change="updateRow(index, { enabled: ($event.target as HTMLInputElement).checked })"
      />
      <span v-else class="size-3.5 shrink-0" />
      <span
        v-if="readonlyName"
        class="w-1/4 shrink-0 truncate font-mono text-[13px] font-medium text-1"
        >{{ row.name }}</span
      >
      <input
        v-else
        :value="row.name"
        placeholder="Name"
        class="w-1/4 shrink-0 bg-transparent font-mono text-[13px] font-medium text-1 outline-none placeholder:text-faint"
        @input="updateRow(index, { name: ($event.target as HTMLInputElement).value })"
        @paste="onPasteName"
      />
      <span class="flex w-1/4 shrink-0 items-center gap-1">
        <input
          v-if="isMasked(index, row)"
          type="password"
          :value="row.value"
          placeholder="Value"
          class="min-w-0 flex-1 bg-transparent font-mono text-[13px] font-medium text-1 outline-none placeholder:text-faint"
          @input="updateRow(index, { value: ($event.target as HTMLInputElement).value })"
        />
        <WCodeEditor
          v-else
          :model-value="row.value"
          single-line
          bare
          :debounce-ms="0"
          placeholder="Value"
          :unresolved-variables="unresolvedVariables"
          :variable-tooltips="variableTooltips"
          :variable-names="variableNames"
          class="min-w-0 flex-1"
          @update:model-value="value => updateRow(index, { value })"
        />
        <button
          v-if="withSecret && row.secret"
          type="button"
          :aria-label="revealed.has(index) ? 'Hide value' : 'Reveal value'"
          class="flex size-5 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          @click="toggleReveal(index)"
        >
          <WIcon :name="revealed.has(index) ? 'eye-off' : 'eye'" />
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
        v-if="allowRemove && index < modelValue.length"
        type="button"
        aria-label="Remove row"
        class="flex size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        @click="removeRow(index)"
      >
        <WIcon name="x" />
      </button>
      <span v-else class="w-6 shrink-0" />
    </div>
  </div>
</template>

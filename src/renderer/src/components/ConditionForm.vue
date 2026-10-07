<script setup lang="ts">
import type { Condition, ConditionOp, ConditionSource } from "@shared/condition";

import { CONDITION_OPS, CONDITION_SOURCES, opNeedsValue } from "@shared/condition";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import WInput from "./WInput.vue";
import WSelect from "./WSelect.vue";

/**
 * Formulário de uma condição estruturada (fonte + operador + valor) — nunca código. Serve o
 * nó "condição" e o "poll until" de um flow, e é o que torna o canvas operável sem mouse.
 */

const props = defineProps<{
  modelValue: Condition;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: Condition];
}>();

const { t } = useI18n();

const sourceOptions = computed(() =>
  CONDITION_SOURCES.map(source => ({
    value: source,
    label: t(`flows.condition.source.${source}`),
  })),
);
const opOptions = computed(() =>
  CONDITION_OPS.map(op => ({ value: op, label: t(`flows.condition.op.${op}`) })),
);

const needsPath = computed(
  () => props.modelValue.source === "body" || props.modelValue.source === "header",
);
const hasOp = computed(() => props.modelValue.source !== "assertions");
const op = computed<ConditionOp>(() => props.modelValue.op ?? "eq");

function update(patch: Partial<Condition>): void {
  const next: Condition = { ...props.modelValue, ...patch };
  if (next.source === "assertions") {
    delete next.path;
    delete next.op;
    delete next.value;
  } else {
    next.op ??= "eq";
    if (next.source === "status") delete next.path;
    if (!opNeedsValue(next.op)) delete next.value;
    else next.value ??= "";
    if (needsPathFor(next.source)) next.path ??= "";
  }
  emit("update:modelValue", next);
}

function needsPathFor(source: ConditionSource): boolean {
  return source === "body" || source === "header";
}
</script>

<template>
  <div class="flex flex-col gap-2" data-testid="condition-form">
    <label class="flex flex-col gap-1 font-inter text-xs text-muted">
      {{ t("flows.condition.sourceLabel") }}
      <WSelect
        :model-value="modelValue.source"
        :options="sourceOptions"
        :disabled="disabled"
        data-testid="condition-source"
        @update:model-value="update({ source: $event as ConditionSource })"
      />
    </label>
    <label v-if="needsPath" class="flex flex-col gap-1 font-inter text-xs text-muted">
      {{
        modelValue.source === "header"
          ? t("flows.condition.headerName")
          : t("flows.condition.bodyPath")
      }}
      <WInput
        :model-value="modelValue.path ?? ''"
        monospace
        :disabled="disabled"
        :placeholder="modelValue.source === 'header' ? 'Content-Type' : 'job.state'"
        data-testid="condition-path"
        @update:model-value="update({ path: $event })"
      />
    </label>
    <label v-if="hasOp" class="flex flex-col gap-1 font-inter text-xs text-muted">
      {{ t("flows.condition.opLabel") }}
      <WSelect
        :model-value="op"
        :options="opOptions"
        :disabled="disabled"
        data-testid="condition-op"
        @update:model-value="update({ op: $event as ConditionOp })"
      />
    </label>
    <label
      v-if="hasOp && opNeedsValue(op)"
      class="flex flex-col gap-1 font-inter text-xs text-muted"
    >
      {{ t("flows.condition.valueLabel") }}
      <WInput
        :model-value="modelValue.value ?? ''"
        monospace
        :disabled="disabled"
        data-testid="condition-value"
        @update:model-value="update({ value: $event })"
      />
    </label>
    <p v-if="modelValue.source === 'assertions'" class="font-inter text-xs text-faint">
      {{ t("flows.condition.assertionsHint") }}
    </p>
  </div>
</template>

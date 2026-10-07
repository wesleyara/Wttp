<script setup lang="ts">
import type { FlowNode } from "@shared";
import type { Condition } from "@shared/condition";

import { formatDuration } from "@renderer/lib/format";
import { useFlowsStore } from "@renderer/stores/flows";
import {
  MAX_DELAY_MS,
  MAX_FUNCTION_OUTPUTS,
  MAX_POLL_ATTEMPTS,
  MIN_POLL_INTERVAL_MS,
} from "@shared/flow";
import {
  FLOW_VARIABLE_PATTERN,
  formatMappingSource,
  parseMappingSource,
} from "@shared/flowMapping";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import ConditionForm from "./ConditionForm.vue";
import WButton from "./WButton.vue";
import WCodeEditor from "./WCodeEditor.vue";
import WIcon from "./WIcon.vue";
import WInput from "./WInput.vue";
import WMethodBadge from "./WMethodBadge.vue";
import WSelect from "./WSelect.vue";
import WStatusBadge from "./WStatusBadge.vue";

/**
 * Painel do nó (ou da aresta) selecionado no canvas (ClickLocal #58/#59): o que ele fez na
 * última execução — request, resposta, asserções, variáveis produzidas —, os campos de edição
 * (condição, poll, delay) e o formulário de mapeamento, que é a alternativa de teclado ao
 * arrastar de porta em porta.
 */

const props = defineProps<{
  path: string;
  nodeId: string | null;
  edge: { from: string; when?: boolean; output?: number } | null;
  readOnly: boolean;
}>();

const emit = defineEmits<{
  deselect: [];
}>();

const { t } = useI18n();
const flows = useFlowsStore();

// --- Largura do painel: o usuário arrasta a borda esquerda (ou usa as setas) e ela fica lembrada ---
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 280;
const MAX_WIDTH = 960;
const WIDTH_STORAGE_KEY = "wttp.flowInspectorWidth";

function clampWidth(value: number): number {
  const ceiling = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - 360));
  return Math.round(Math.min(ceiling, Math.max(MIN_WIDTH, value)));
}

function loadWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function saveWidth(): void {
  try {
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width.value));
  } catch {
    // Sem armazenamento (janela privada, dados bloqueados): a largura só vale nesta sessão.
  }
}

const width = ref(loadWidth());
let resizing: { startX: number; startWidth: number } | null = null;

function onResizeMove(event: PointerEvent): void {
  if (!resizing) return;
  // A borda é a esquerda: arrastar para a esquerda alarga o painel.
  width.value = clampWidth(resizing.startWidth + (resizing.startX - event.clientX));
}

function stopResize(): void {
  if (!resizing) return;
  resizing = null;
  window.removeEventListener("pointermove", onResizeMove);
  window.removeEventListener("pointerup", stopResize);
  document.body.style.userSelect = "";
  saveWidth();
}

function startResize(event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  resizing = { startX: event.clientX, startWidth: width.value };
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", onResizeMove);
  window.addEventListener("pointerup", stopResize);
}

function onResizeKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 80 : 20;
  if (event.key === "ArrowLeft") width.value = clampWidth(width.value + step);
  else if (event.key === "ArrowRight") width.value = clampWidth(width.value - step);
  else if (event.key === "Home") width.value = MIN_WIDTH;
  else if (event.key === "End") width.value = clampWidth(MAX_WIDTH);
  else return;
  event.preventDefault();
  saveWidth();
}

function resetWidth(): void {
  width.value = DEFAULT_WIDTH;
  saveWidth();
}

onBeforeUnmount(stopResize);
/** `{{nome}}` como o usuário a escreve numa request — string do script para não confundir o template. */
const example = "{{" + "name" + "}}";

const flow = computed(() => flows.current(props.path));
const node = computed<FlowNode | null>(
  () => flow.value?.nodes.find(candidate => candidate.id === props.nodeId) ?? null,
);
const run = computed(() => flows.runOf(props.path));
const result = computed(() => (node.value ? run.value.results[node.value.id] : undefined));
const request = computed(() =>
  node.value?.request ? flows.requests.find(r => r.path === node.value!.request) : undefined,
);
const isStart = computed(
  () => !!node.value && (flow.value?.start ?? flow.value?.nodes[0]?.id) === node.value.id,
);

// --- Mapeamentos deste nó ---------------------------------------------------------------------

const ownMappings = computed(() =>
  (flow.value?.mappings ?? []).filter(
    mapping => parseMappingSource(mapping.from)?.nodeId === node.value?.id,
  ),
);

const kind = ref<"body" | "header" | "status">("body");
const detail = ref("");
const variable = ref("");

watch(
  () => props.nodeId,
  () => {
    kind.value = "body";
    detail.value = "";
    variable.value = "";
  },
);

const kindOptions = computed(() => [
  { value: "body", label: t("flows.mapping.kind.body") },
  { value: "header", label: t("flows.mapping.kind.header") },
  { value: "status", label: t("flows.mapping.kind.status") },
]);

const builtFrom = computed(() => {
  if (!node.value) return "";
  if (kind.value === "status") return formatMappingSource(node.value.id, { kind: "status" });
  const text = detail.value.trim();
  if (!text) return "";
  return formatMappingSource(
    node.value.id,
    kind.value === "header" ? { kind: "header", name: text } : { kind: "body", path: text },
  );
});
const variableValid = computed(() => FLOW_VARIABLE_PATTERN.test(variable.value.trim()));
const canAddMapping = computed(() => builtFrom.value !== "" && variableValid.value);

function addMapping(): void {
  if (!canAddMapping.value) return;
  if (flows.addMapping(props.path, builtFrom.value, variable.value.trim())) {
    detail.value = "";
    variable.value = "";
  }
}

// --- Campos dos nós de controle ---------------------------------------------------------------

function setWhen(when: Condition): void {
  if (node.value) flows.updateNode(props.path, node.value.id, { when });
}

function setNumber(field: "intervalMs" | "maxAttempts" | "ms", text: string): void {
  const value = Number(text);
  if (!node.value || text.trim() === "" || !Number.isFinite(value)) return;
  flows.updateNode(props.path, node.value.id, { [field]: Math.trunc(value) });
}

const intervalTooLow = computed(
  () => (node.value?.intervalMs ?? MIN_POLL_INTERVAL_MS) < MIN_POLL_INTERVAL_MS,
);
const attemptsInvalid = computed(() => {
  const value = node.value?.maxAttempts ?? 0;
  return value < 1 || value > MAX_POLL_ATTEMPTS;
});
const delayInvalid = computed(() => {
  const value = node.value?.ms ?? 0;
  return value < 0 || value > MAX_DELAY_MS;
});

const failedAssertions = computed(() => result.value?.assertions?.filter(a => !a.passed) ?? []);
const bodyPreview = computed(() => {
  const body = result.value?.response?.body ?? "";
  return body.length > 1500 ? `${body.slice(0, 1500)}…` : body;
});

const exampleVariable = "{{" + "name" + "}}";

function setCode(code: string): void {
  if (node.value && code !== node.value.code) flows.updateNode(props.path, node.value.id, { code });
}

function setOutputs(text: string): void {
  const value = Number(text);
  if (!node.value || text.trim() === "" || !Number.isFinite(value)) return;
  flows.setFunctionOutputs(props.path, node.value.id, value);
}

const outputsInvalid = computed(() => {
  const value = node.value?.outputs ?? 0;
  return !Number.isInteger(value) || value < 1 || value > MAX_FUNCTION_OUTPUTS;
});

const edgeLabel = computed(() => {
  if (!props.edge) return "";
  const target = flow.value?.edges?.find(
    candidate =>
      candidate.from === props.edge!.from &&
      candidate.when === props.edge!.when &&
      candidate.output === props.edge!.output,
  )?.to;
  return t("flows.inspector.edge", { from: props.edge.from, to: target ?? "?" });
});
</script>

<template>
  <aside
    class="relative flex shrink-0 flex-col overflow-y-auto border-l border-subtle bg-surface-1"
    :style="{ width: `${width}px` }"
    data-testid="flow-inspector"
  >
    <!-- Alça de redimensionar: arrastar, setas (Shift = passo maior), Home/End, duplo clique restaura. -->
    <div
      class="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-accent/40 focus-visible:bg-accent/60 focus-visible:outline-none"
      role="separator"
      aria-orientation="vertical"
      :aria-label="t('flows.inspector.resize')"
      :aria-valuenow="width"
      :aria-valuemin="MIN_WIDTH"
      :aria-valuemax="MAX_WIDTH"
      tabindex="0"
      data-testid="flow-inspector-resize"
      @pointerdown="startResize"
      @keydown="onResizeKeydown"
      @dblclick="resetWidth"
    />
    <!-- Aresta selecionada -->
    <div v-if="edge" class="flex flex-col gap-3 p-4">
      <h3 class="font-inter text-xs font-semibold text-muted">
        {{ t("flows.inspector.connection") }}
      </h3>
      <p class="font-mono text-[12px] text-1">{{ edgeLabel }}</p>
      <WButton
        size="sm"
        variant="danger"
        :disabled="readOnly"
        data-testid="flow-disconnect"
        @click="
          flows.disconnect(path, edge.from, edge.when);
          emit('deselect');
        "
      >
        <WIcon name="unlink" />
        {{ t("flows.inspector.disconnect") }}
      </WButton>
    </div>

    <p v-else-if="!node" class="p-4 font-inter text-xs text-faint">
      {{ t("flows.inspector.pick") }}
    </p>

    <div v-else class="flex flex-col gap-4 p-4" :data-testid="`flow-inspector-${node.type}`">
      <header class="flex items-center gap-2">
        <WMethodBadge v-if="request" :method="request.method" class="shrink-0" />
        <h3 class="min-w-0 flex-1 truncate font-barlow text-base font-semibold text-1">
          {{ request?.name ?? t(`flows.nodeType.${node.type}`) }}
        </h3>
        <button
          type="button"
          class="flex size-6 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-status-5xx disabled:opacity-30"
          :title="t('flows.removeNode')"
          :aria-label="t('flows.removeNode')"
          :disabled="readOnly"
          data-testid="flow-remove-node"
          @click="
            flows.removeNode(path, node.id);
            emit('deselect');
          "
        >
          <WIcon name="trash-2" />
        </button>
      </header>
      <p class="-mt-3 truncate font-mono text-[11px] text-faint" :title="node.request">
        {{ node.id }}<template v-if="node.request"> · {{ node.request }}</template>
      </p>

      <label class="flex items-center gap-2 font-inter text-xs text-muted">
        <input
          type="checkbox"
          class="accent-accent"
          :checked="isStart"
          :disabled="readOnly || isStart"
          data-testid="flow-start"
          @change="flows.setStart(path, node.id)"
        />
        {{ t("flows.inspector.start") }}
      </label>

      <!-- Request -->
      <template v-if="node.type === 'request'">
        <p
          v-if="!request"
          class="rounded-md bg-status-4xx/10 px-2 py-1.5 font-inter text-xs text-status-4xx"
          data-testid="flow-node-broken"
        >
          {{ t("flows.brokenNode", { request: node.request ?? "" }) }}
        </p>

        <section class="flex flex-col gap-2">
          <h4 class="font-inter text-xs font-semibold text-muted">
            {{ t("flows.mappings") }}
            <span class="font-normal text-faint">{{ ownMappings.length }}</span>
          </h4>
          <p class="font-inter text-[11px] text-faint">
            {{ t("flows.mappingsHintNode", { example }) }}
          </p>
          <ul class="flex flex-col gap-1" data-testid="flow-mappings">
            <li
              v-for="mapping in ownMappings"
              :key="`${mapping.from}→${mapping.to}`"
              class="flex items-center gap-1 rounded-md border border-subtle bg-surface-2 px-2 py-1 font-mono text-[11px]"
              data-testid="flow-mapping"
            >
              <span class="min-w-0 flex-1 truncate text-1" :title="mapping.from">
                {{ mapping.from.slice(node.id.length + 5) }}
              </span>
              <WIcon name="arrow-right" class="shrink-0 text-faint" />
              <span class="shrink-0 text-status-2xx">{{ mapping.to }}</span>
              <button
                type="button"
                class="flex size-5 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-status-5xx"
                :title="t('flows.removeMapping')"
                :aria-label="t('flows.removeMapping')"
                :disabled="readOnly"
                @click="flows.removeMapping(path, mapping.from, mapping.to)"
              >
                <WIcon name="x" />
              </button>
            </li>
          </ul>
          <div class="flex flex-col gap-1.5">
            <WSelect
              :model-value="kind"
              :options="kindOptions"
              :disabled="readOnly"
              data-testid="flow-mapping-kind"
              @update:model-value="kind = $event as 'body' | 'header' | 'status'"
            />
            <WInput
              v-if="kind !== 'status'"
              v-model="detail"
              monospace
              :disabled="readOnly"
              :placeholder="
                kind === 'header' ? t('flows.mapping.headerName') : t('flows.mapping.bodyPath')
              "
              data-testid="flow-mapping-path"
            />
            <WInput
              v-model="variable"
              monospace
              :disabled="readOnly"
              :error="variable !== '' && !variableValid"
              :placeholder="t('flows.mapping.variable')"
              data-testid="flow-mapping-to"
            />
            <WButton
              size="sm"
              variant="secondary"
              :disabled="!canAddMapping || readOnly"
              data-testid="flow-add-mapping"
              @click="addMapping"
            >
              <WIcon name="plus" />
              {{ t("flows.addMapping") }}
            </WButton>
          </div>
        </section>
      </template>

      <!-- Condição e poll until -->
      <section
        v-if="node.type === 'condition' || node.type === 'pollUntil'"
        class="flex flex-col gap-3"
      >
        <h4 class="font-inter text-xs font-semibold text-muted">
          {{ t("flows.condition.title") }}
        </h4>
        <ConditionForm
          v-if="node.when"
          :model-value="node.when"
          :disabled="readOnly"
          @update:model-value="setWhen"
        />
        <p v-if="node.type === 'condition'" class="font-inter text-[11px] text-faint">
          {{ t("flows.inspector.conditionHint") }}
        </p>
      </section>

      <section v-if="node.type === 'pollUntil'" class="flex flex-col gap-2">
        <label class="flex flex-col gap-1 font-inter text-xs text-muted">
          {{ t("flows.poll.interval") }}
          <WInput
            type="number"
            :model-value="String(node.intervalMs ?? '')"
            :error="intervalTooLow"
            :disabled="readOnly"
            monospace
            data-testid="poll-interval"
            @update:model-value="setNumber('intervalMs', $event)"
          />
          <span v-if="intervalTooLow" class="text-status-5xx">
            {{ t("flows.poll.intervalMin", { min: MIN_POLL_INTERVAL_MS }) }}
          </span>
        </label>
        <label class="flex flex-col gap-1 font-inter text-xs text-muted">
          {{ t("flows.poll.maxAttempts") }}
          <WInput
            type="number"
            :model-value="String(node.maxAttempts ?? '')"
            :error="attemptsInvalid"
            :disabled="readOnly"
            monospace
            data-testid="poll-attempts"
            @update:model-value="setNumber('maxAttempts', $event)"
          />
          <span v-if="attemptsInvalid" class="text-status-5xx">
            {{ t("flows.poll.attemptsInvalid", { max: MAX_POLL_ATTEMPTS }) }}
          </span>
        </label>
        <p class="font-inter text-[11px] text-faint">{{ t("flows.poll.hint") }}</p>
      </section>

      <!-- Função: N saídas e o código JavaScript, rodando isolado como os scripts de request -->
      <section v-if="node.type === 'function'" class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 font-inter text-xs text-muted">
          {{ t("flows.function.outputs") }}
          <WInput
            type="number"
            :model-value="String(node.outputs ?? '')"
            :error="outputsInvalid"
            :disabled="readOnly"
            monospace
            data-testid="function-outputs"
            @update:model-value="setOutputs"
          />
          <span :class="outputsInvalid ? 'text-status-5xx' : 'text-faint'">
            {{ t("flows.function.outputsHint", { max: MAX_FUNCTION_OUTPUTS }) }}
          </span>
        </label>
        <div class="flex flex-col gap-1">
          <span class="font-inter text-xs text-muted">{{ t("flows.function.code") }}</span>
          <div class="h-64">
            <WCodeEditor
              :model-value="node.code ?? ''"
              language="javascript"
              script-phase="function"
              :read-only="readOnly"
              :debounce-ms="150"
              data-testid="function-code"
              @update:model-value="setCode"
            />
          </div>
          <p class="font-inter text-[11px] text-faint">{{ t("flows.function.codeHint") }}</p>
          <p class="font-inter text-[11px] text-faint">
            {{ t("flows.function.api", { example: exampleVariable }) }}
          </p>
        </div>
      </section>

      <!-- Delay -->
      <section v-if="node.type === 'delay'" class="flex flex-col gap-1">
        <label class="flex flex-col gap-1 font-inter text-xs text-muted">
          {{ t("flows.delay.ms") }}
          <WInput
            type="number"
            :model-value="String(node.ms ?? '')"
            :error="delayInvalid"
            :disabled="readOnly"
            monospace
            data-testid="delay-ms"
            @update:model-value="setNumber('ms', $event)"
          />
        </label>
        <span v-if="delayInvalid" class="font-inter text-xs text-status-5xx">
          {{ t("flows.delay.invalid", { max: MAX_DELAY_MS }) }}
        </span>
      </section>

      <!-- Última execução -->
      <section v-if="result" class="flex flex-col gap-2" data-testid="flow-node-result">
        <h4 class="font-inter text-xs font-semibold text-muted">
          {{ t("flows.inspector.lastRun") }}
        </h4>
        <div class="flex items-center gap-2 font-inter text-xs">
          <WIcon
            :name="result.passed ? 'circle-check' : 'circle-x'"
            :class="result.passed ? 'text-status-2xx' : 'text-status-5xx'"
          />
          <WStatusBadge v-if="result.result" :code="result.result.status" />
          <span class="font-mono text-faint">{{ formatDuration(result.durationMs) }}</span>
          <span v-if="result.output" class="text-muted">
            {{ t("flows.outputN", { n: result.output }) }}
          </span>
          <span v-if="result.attempts" class="text-muted">
            {{ t("flows.inspector.attempts", { count: result.attempts }) }}
          </span>
        </div>
        <p v-if="result.result" class="break-all font-mono text-[11px] text-muted">
          {{ result.result.method }} {{ result.result.url }}
        </p>
        <p v-if="result.message" class="font-inter text-xs text-muted">{{ result.message }}</p>
        <p v-if="result.result?.error" class="font-inter text-xs text-status-5xx">
          {{ result.result.error.error.message }}
        </p>
        <p
          v-for="message in result.mappingErrors"
          :key="message"
          class="font-inter text-xs text-status-4xx"
          data-testid="flow-mapping-error"
        >
          {{ message }}
        </p>
        <p
          v-for="assertion in failedAssertions"
          :key="assertion.name"
          class="font-inter text-xs text-status-5xx"
        >
          ✗ {{ assertion.name
          }}<template v-if="assertion.message"> — {{ assertion.message }}</template>
        </p>
        <p v-if="result.assertions?.length" class="font-inter text-xs text-faint">
          {{
            t("flows.assertions", {
              passed: result.assertions.filter(a => a.passed).length,
              total: result.assertions.length,
            })
          }}
        </p>
        <p v-if="result.result?.unresolved.length" class="font-inter text-xs text-status-4xx">
          {{ t("flows.unresolved", { names: result.result.unresolved.join(", ") }) }}
        </p>
        <ul v-if="result.produced.length" class="flex flex-col gap-0.5">
          <li
            v-for="produced in result.produced"
            :key="produced.name"
            class="flex gap-1.5 font-mono text-[11px]"
            data-testid="flow-produced"
          >
            <span class="text-faint">{{ t("flows.produced") }}</span>
            <span class="text-1">{{ produced.name }}</span>
            <span class="text-faint">=</span>
            <span class="min-w-0 break-all text-status-2xx">{{ produced.value }}</span>
          </li>
        </ul>
        <template v-if="result.console?.length">
          <h4 class="font-inter text-xs font-semibold text-muted">{{ t("flows.console") }}</h4>
          <ul class="flex flex-col gap-0.5" data-testid="flow-console">
            <li
              v-for="(entry, index) in result.console"
              :key="index"
              class="break-all font-mono text-[11px]"
              :class="
                entry.level === 'error'
                  ? 'text-status-5xx'
                  : entry.level === 'warn'
                    ? 'text-status-4xx'
                    : 'text-muted'
              "
            >
              {{ entry.message }}
            </li>
          </ul>
        </template>
        <template v-if="result.response">
          <h4 class="font-inter text-xs font-semibold text-muted">
            {{ t("flows.inspector.response") }}
          </h4>
          <pre
            class="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-subtle bg-surface-2 p-2 font-mono text-[11px] text-muted"
            data-testid="flow-response-body"
            >{{ bodyPreview }}</pre>
        </template>
      </section>
    </div>
  </aside>
</template>

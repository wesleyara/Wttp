<script setup lang="ts">
import { formatDuration } from "@renderer/lib/format";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { useFlowsStore } from "@renderer/stores/flows";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import FlowCanvas from "./FlowCanvas.vue";
import FlowInspector from "./FlowInspector.vue";
import WButton from "./WButton.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WInput from "./WInput.vue";
import WSelect from "./WSelect.vue";

/**
 * Aba de um flow (ClickLocal #57/#58/#59): canvas com os nós e as arestas, painel do nó
 * selecionado, e Run/Stop. As edições vão para um rascunho (bolinha na aba, Ctrl+S salva) e o
 * Run executa o que está na tela, salvo ou não.
 */

const props = defineProps<{
  /** Nome do arquivo em `flows/`. */
  path: string;
}>();

const { t } = useI18n();
const flows = useFlowsStore();
const environment = useEnvironmentStore();

const item = computed(() => flows.find(props.path));
const flow = computed(() => flows.current(props.path));
const dirty = computed(() => flows.isDirty(props.path));
const run = computed(() => flows.runOf(props.path));
const running = computed(() => run.value.status === "running");
const broken = computed(() => (flow.value ? flows.brokenNodeIds(flow.value) : new Set<string>()));

const activeEnvironmentName = computed(
  () => environment.active?.data.name ?? t("flows.noEnvironment"),
);

const selectedId = ref<string | null>(null);
const selectedEdge = ref<{ from: string; when?: boolean; output?: number } | null>(null);
const showPorts = ref(false);

watch(
  () => props.path,
  () => {
    selectedId.value = null;
    selectedEdge.value = null;
  },
);

// --- Nome ---------------------------------------------------------------------------------
const draftName = ref("");
watch(
  () => item.value?.name,
  name => (draftName.value = name ?? ""),
  { immediate: true },
);

function commitName(): void {
  if (draftName.value.trim() && draftName.value.trim() !== item.value?.name) {
    void flows.rename(props.path, draftName.value);
  } else {
    draftName.value = item.value?.name ?? "";
  }
}

// --- Adicionar nós -----------------------------------------------------------------------
const requestToAdd = ref("");
const requestOptions = computed(() => [
  { value: "", label: t("flows.pickRequest") },
  ...flows.requests.map(request => ({
    value: request.path,
    label: `${request.method} ${request.folder ? `${request.folder} / ` : ""}${request.name}`,
  })),
]);

function addRequest(): void {
  if (!requestToAdd.value) return;
  const id = flows.addRequestNode(props.path, requestToAdd.value, { connect: true });
  requestToAdd.value = "";
  if (id) selectedId.value = id;
}

function addControl(type: "condition" | "pollUntil" | "delay" | "function"): void {
  const id = flows.addControlNode(props.path, type, { connect: true });
  if (id) selectedId.value = id;
}

const runBlocked = computed(
  () => !flow.value || flow.value.nodes.length === 0 || broken.value.size > 0,
);

const summaryTone = computed(() => {
  const summary = run.value.summary;
  if (!summary) return "";
  return summary.failed === 0 && !summary.endedEarly ? "text-status-2xx" : "text-status-5xx";
});
</script>

<template>
  <div class="flex min-h-0 flex-col overflow-hidden bg-surface-1" data-testid="flow-panel">
    <WEmptyState
      v-if="!item"
      :title="t('flows.missing.title')"
      :description="t('flows.missing.description')"
    />

    <template v-else>
      <header class="flex shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-4 py-2">
        <WIcon name="workflow" size="4" class="text-faint" />
        <WInput
          v-model="draftName"
          class="w-56"
          :aria-label="t('flows.name')"
          :disabled="running"
          data-testid="flow-name"
          @focusout="commitName"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <span
          v-if="dirty"
          class="flex items-center gap-1 font-inter text-xs text-muted"
          data-testid="flow-dirty"
        >
          <span class="size-1.5 rounded-full bg-accent" aria-hidden="true" />
          {{ t("flows.unsaved") }}
        </span>
        <span class="font-inter text-xs text-faint">
          {{ t("flows.environment", { name: activeEnvironmentName }) }}
        </span>
        <span class="flex-1" />
        <label class="flex items-center gap-1.5 font-inter text-xs text-muted">
          <input
            v-model="showPorts"
            type="checkbox"
            class="accent-accent"
            data-testid="flow-ports-toggle"
          />
          {{ t("flows.showPorts") }}
        </label>
        <label class="flex items-center gap-1.5 font-inter text-xs text-muted">
          <input v-model="flows.bail" type="checkbox" class="accent-accent" />
          {{ t("flows.bail") }}
        </label>
        <WButton
          size="sm"
          variant="secondary"
          :disabled="!dirty || running"
          :title="t('flows.saveHint')"
          data-testid="flow-save"
          @click="flows.save(path)"
        >
          <WIcon name="save" />
          {{ t("common.save") }}
        </WButton>
        <WButton
          v-if="running"
          variant="danger"
          size="sm"
          data-testid="flow-stop"
          @click="flows.stop(path)"
        >
          <WIcon name="square" />
          {{ run.stopping ? t("flows.stopping") : t("flows.stop") }}
        </WButton>
        <WButton
          v-else
          variant="primary"
          size="sm"
          :disabled="runBlocked"
          :title="runBlocked ? t('flows.runBlocked') : undefined"
          data-testid="flow-run"
          @click="flows.run(path)"
        >
          <WIcon name="play" />
          {{ t("flows.run") }}
        </WButton>
      </header>

      <!-- Paleta: adicionar nós -->
      <div
        v-if="flow"
        class="flex shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-4 py-1.5"
        data-testid="flow-palette"
      >
        <div class="w-72 max-w-full">
          <WSelect
            v-model="requestToAdd"
            :options="requestOptions"
            :disabled="running"
            data-testid="flow-add-request"
          />
        </div>
        <WButton
          size="sm"
          variant="secondary"
          :disabled="!requestToAdd || running"
          data-testid="flow-add-node"
          @click="addRequest"
        >
          <WIcon name="plus" />
          {{ t("flows.addNode") }}
        </WButton>
        <span class="mx-1 h-4 w-px bg-subtle" aria-hidden="true" />
        <WButton
          size="sm"
          variant="ghost"
          :disabled="running"
          data-testid="flow-add-condition"
          @click="addControl('condition')"
        >
          <WIcon name="split" />
          {{ t("flows.nodeType.condition") }}
        </WButton>
        <WButton
          size="sm"
          variant="ghost"
          :disabled="running"
          data-testid="flow-add-poll"
          @click="addControl('pollUntil')"
        >
          <WIcon name="repeat" />
          {{ t("flows.nodeType.pollUntil") }}
        </WButton>
        <WButton
          size="sm"
          variant="ghost"
          :disabled="running"
          data-testid="flow-add-delay"
          @click="addControl('delay')"
        >
          <WIcon name="timer" />
          {{ t("flows.nodeType.delay") }}
        </WButton>
        <WButton
          size="sm"
          variant="ghost"
          :disabled="running"
          data-testid="flow-add-function"
          @click="addControl('function')"
        >
          <WIcon name="braces" />
          {{ t("flows.nodeType.function") }}
        </WButton>
        <span class="flex-1" />
        <span class="font-inter text-[11px] text-faint">{{ t("flows.dragHint") }}</span>
      </div>

      <p
        v-if="flows.error"
        class="mx-4 mt-2 rounded-md bg-status-5xx/10 px-3 py-2 font-inter text-xs text-status-5xx"
        data-testid="flow-error"
      >
        {{ flows.error.message }}
      </p>

      <!-- Arquivo inválido: o app não edita o que não entende, mostra o erro. -->
      <div
        v-if="!flow"
        class="m-4 rounded-md bg-status-5xx/10 px-3 py-2 font-inter text-xs text-status-5xx"
        data-testid="flow-invalid"
      >
        <p class="font-semibold">{{ t("flows.invalid") }}</p>
        <p v-for="issue in item.issues ?? []" :key="issue.path + issue.message">
          {{ issue.line ? `${t("flows.line", { line: issue.line })}: ` : "" }}{{ issue.message }}
        </p>
      </div>

      <template v-else>
        <!-- Resultado do run -->
        <div
          v-if="run.status === 'failed'"
          class="mx-4 mt-2 shrink-0 rounded-md bg-status-5xx/10 px-3 py-2 font-inter text-xs text-status-5xx"
          data-testid="flow-failed"
        >
          <p class="font-semibold">{{ run.error?.message }}</p>
          <!-- O primeiro problema já é a mensagem do erro: só lista os outros. -->
          <p
            v-for="issue in run.issues.filter(i => i.message !== run.error?.message)"
            :key="issue.message"
          >
            {{ issue.message }}
          </p>
        </div>
        <div
          v-else-if="run.summary"
          class="mx-4 mt-2 flex shrink-0 flex-wrap items-center gap-3 rounded-md border border-subtle bg-surface-2 px-3 py-2 font-inter text-xs"
          data-testid="flow-summary"
        >
          <span class="font-semibold" :class="summaryTone">
            {{
              run.summary.failed === 0 && !run.summary.endedEarly
                ? t("flows.summary.passed")
                : t("flows.summary.failed")
            }}
          </span>
          <span class="text-muted">
            {{ t("flows.summary.nodes", { passed: run.summary.passed, total: run.summary.total }) }}
          </span>
          <span class="text-faint">{{ formatDuration(run.summary.durationMs) }}</span>
          <span v-if="run.summary.endedEarly" class="text-status-4xx">
            {{ t(`flows.summary.endedEarly.${run.summary.endedEarly}`) }}
          </span>
          <span v-if="run.summary.message" class="text-muted" data-testid="flow-summary-message">
            {{ run.summary.message }}
          </span>
        </div>

        <div class="mt-2 flex min-h-0 flex-1 border-t border-subtle">
          <FlowCanvas
            v-model:selected-id="selectedId"
            v-model:selected-edge="selectedEdge"
            class="min-w-0 flex-1"
            :path="path"
            :flow="flow"
            :show-ports="showPorts"
            :read-only="running"
          />
          <FlowInspector
            :path="path"
            :node-id="selectedId"
            :edge="selectedEdge"
            :read-only="running"
            @deselect="
              selectedId = null;
              selectedEdge = null;
            "
          />
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { FlowFile, FlowNode } from "@shared";
import type { Connection, Edge, Node } from "@vue-flow/core";

import { findRequestData, outputPorts, requestVariables } from "@renderer/lib/flowPorts";
import { NODE_WIDTH, useFlowsStore } from "@renderer/stores/flows";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { describeCondition } from "@shared/condition";
import { formatMappingSource, parseMappingSource, type ValueSource } from "@shared/flowMapping";
import { BaseEdge, getBezierPath, Handle, Position, useVueFlow, VueFlow } from "@vue-flow/core";
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

import WIcon from "./WIcon.vue";
import WMethodBadge from "./WMethodBadge.vue";
import WStatusBadge from "./WStatusBadge.vue";

import "@vue-flow/core/dist/style.css";

/**
 * Canvas do flow (ClickLocal #58) sobre o `@vue-flow/core`: pan/zoom, nós arrastáveis, arestas
 * criadas arrastando de uma saída a um nó e — com as "portas de dados" ligadas — mapeamentos
 * criados arrastando um campo da resposta até a `{{variável}}` de outro nó. Só o CSS estrutural
 * da lib é importado (nunca o tema padrão): toda cor vem de tokens semânticos nas classes dos
 * nós e das arestas. Toda edição vai para o rascunho de `useFlowsStore`.
 */

interface SelectedEdge {
  from: string;
  when?: boolean;
  output?: number;
}

const props = defineProps<{
  /** Nome do arquivo em `flows/`. */
  path: string;
  flow: FlowFile;
  selectedId: string | null;
  selectedEdge: SelectedEdge | null;
  showPorts: boolean;
  readOnly: boolean;
}>();

const emit = defineEmits<{
  "update:selectedId": [id: string | null];
  "update:selectedEdge": [edge: SelectedEdge | null];
}>();

const { t } = useI18n();
const flows = useFlowsStore();
const workspace = useWorkspaceStore();

const HEADER_H = 52;
const OUTPUT_ROW_H = 22;
const PORT_ROW_H = 22;
const MAX_PORT_ROWS = 6;

const wrapper = useTemplateRef<HTMLElement>("wrapper");
const flowId = `flow-canvas-${props.path}`;
const {
  fitView,
  zoomIn,
  zoomOut,
  viewport,
  screenToFlowCoordinate,
  onConnect,
  onConnectStart,
  onConnectEnd,
  onNodeDragStop,
  onPaneClick,
  onEdgeClick,
  onNodesInitialized,
} = useVueFlow(flowId);

const run = computed(() => flows.runOf(props.path));
const showStates = computed(() => run.value.status !== "idle");

// --- Dados dos nós --------------------------------------------------------------------------

const requestsByPath = computed(
  () => new Map(flows.requests.map(request => [request.path, request])),
);

interface NodeView {
  node: FlowNode;
  title: string;
  method: string | null;
  broken: boolean;
  state: ReturnType<typeof flows.visualState>;
  inputs: string[];
  outputs: ReturnType<typeof outputPorts>;
  /** Altura da faixa do cabeçalho: cresce com o número de saídas de uma função. */
  headerHeight: number;
  /** Quantas saídas numeradas o nó mostra (só `function`). */
  fnOutputs: number;
}

const views = computed<NodeView[]>(() =>
  props.flow.nodes.map(node => {
    const request = node.request ? requestsByPath.value.get(node.request) : undefined;
    const data =
      node.type === "request" && node.request
        ? findRequestData(workspace.tree?.children ?? [], node.request)
        : null;
    const fnOutputs = node.type === "function" ? (node.outputs ?? 1) : 0;
    return {
      node,
      title:
        node.type === "request"
          ? (request?.name ?? node.request ?? node.id)
          : t(`flows.nodeType.${node.type}`),
      method: request?.method ?? null,
      broken: node.type === "request" && !request,
      state: flows.visualState(props.path, node.id),
      inputs: data ? requestVariables(data) : [],
      outputs: node.type === "request" ? outputPorts(flows.samples[node.request ?? ""]) : [],
      headerHeight: Math.max(HEADER_H, 12 + fnOutputs * OUTPUT_ROW_H),
      fnOutputs,
    };
  }),
);

const viewById = computed(() => new Map(views.value.map(view => [view.node.id, view])));

function summaryOf(node: FlowNode): string {
  if (node.type === "condition" && node.when) return describeCondition(node.when);
  if (node.type === "pollUntil" && node.when) {
    return t("flows.pollSummary", {
      condition: describeCondition(node.when),
      attempts: node.maxAttempts ?? 0,
    });
  }
  if (node.type === "delay") return t("flows.delaySummary", { ms: node.ms ?? 0 });
  if (node.type === "function") return t("flows.functionSummary", { count: node.outputs ?? 1 });
  return "";
}

// --- Nós e arestas no formato do @vue-flow -----------------------------------------------------

const vfNodes = computed<Node[]>(() =>
  views.value.map(view => ({
    id: view.node.id,
    type: "flow",
    position: { x: view.node.x ?? 0, y: view.node.y ?? 0 },
    data: view,
    draggable: !props.readOnly,
    connectable: !props.readOnly,
    selectable: false,
    focusable: false,
  })),
);

/** Arestas que o último run percorreu: pares consecutivos da ordem de execução. */
const takenPairs = computed(() => {
  const pairs = new Set<string>();
  const order = run.value.order;
  for (let i = 1; i < order.length; i++) pairs.add(`${order[i - 1]}>${order[i]}`);
  return pairs;
});

function sourceHandleOf(
  view: NodeView | undefined,
  edge: { when?: boolean; output?: number },
): string {
  if (view?.node.type === "condition") return edge.when === false ? "out-false" : "out-true";
  if (view?.node.type === "function") return `out-${edge.output ?? 1}`;
  return "out";
}

function edgeId(edge: { from: string; when?: boolean; output?: number }): string {
  return `${edge.from}:${String(edge.when)}:${String(edge.output)}`;
}

const vfFlowEdges = computed<Edge[]>(() =>
  (props.flow.edges ?? []).flatMap(edge => {
    const from = viewById.value.get(edge.from);
    if (!from || !viewById.value.has(edge.to)) return [];
    const label =
      edge.when !== undefined
        ? edge.when
          ? t("flows.true")
          : t("flows.false")
        : edge.output !== undefined
          ? String(edge.output)
          : "";
    return [
      {
        id: edgeId(edge),
        source: edge.from,
        target: edge.to,
        sourceHandle: sourceHandleOf(from, edge),
        targetHandle: "in",
        type: "flow",
        selectable: false,
        focusable: false,
        data: {
          label,
          positive: edge.when !== false,
          taken: takenPairs.value.has(`${edge.from}>${edge.to}`),
          selected:
            props.selectedEdge?.from === edge.from &&
            props.selectedEdge.when === edge.when &&
            props.selectedEdge.output === edge.output,
          edge,
        },
      },
    ];
  }),
);

/** Linhas tracejadas dos mapeamentos: do nó de origem aos nós que usam a variável. */
const vfMappingEdges = computed<Edge[]>(() => {
  const edges: Edge[] = [];
  for (const mapping of props.flow.mappings ?? []) {
    const source = parseMappingSource(mapping.from);
    const from = source ? viewById.value.get(source.nodeId) : undefined;
    if (!from) continue;
    for (const target of views.value) {
      if (target.node.id === from.node.id || !target.inputs.includes(mapping.to)) continue;
      edges.push({
        id: `map:${mapping.from}→${mapping.to}→${target.node.id}`,
        source: from.node.id,
        target: target.node.id,
        sourceHandle: "map-out",
        targetHandle: "map-in",
        type: "mapping",
        selectable: false,
        focusable: false,
        interactionWidth: 0,
        data: { name: mapping.to },
      });
    }
  }
  return edges;
});

const vfEdges = computed<Edge[]>(() => [...vfFlowEdges.value, ...vfMappingEdges.value]);

function pathOf(p: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
}): string {
  return getBezierPath(p)[0];
}

function edgeTone(data: { selected: boolean; taken: boolean }): string {
  return data.selected ? "text-1" : data.taken ? "text-accent" : "text-faint";
}

// --- Conexões ----------------------------------------------------------------------------------

interface PendingConnection {
  nodeId: string;
  handleId: string;
}

let pending: PendingConnection | null = null;
let connectedByHandle = false;

/** `out-true` / `out-false` / `out-3` / `out` → o que a aresta guarda. */
function parseSourceHandle(handleId: string): { when?: boolean; output?: number } {
  if (handleId === "out-true") return { when: true };
  if (handleId === "out-false") return { when: false };
  const match = /^out-(\d+)$/.exec(handleId);
  return match ? { output: Number(match[1]) } : {};
}

function connectFrom(nodeId: string, handleId: string, target: string): void {
  if (nodeId === target) return;
  const { when, output } = parseSourceHandle(handleId);
  flows.connect(props.path, nodeId, target, when, output);
}

onConnectStart(params => {
  pending =
    params.nodeId && params.handleId ? { nodeId: params.nodeId, handleId: params.handleId } : null;
  connectedByHandle = false;
});

onConnect((connection: Connection) => {
  connectedByHandle = true;
  if (props.readOnly || !connection.sourceHandle) return;
  connectFrom(connection.source, connection.sourceHandle, connection.target);
});

// Soltar em qualquer parte do nó também liga — a bolinha de entrada é pequena.
onConnectEnd(event => {
  const start = pending;
  pending = null;
  if (!start || connectedByHandle || props.readOnly || !event) return;
  const point = "clientX" in event ? event : null;
  if (!point) return;
  const card = document
    .elementFromPoint(point.clientX, point.clientY)
    ?.closest<HTMLElement>("[data-node-id]");
  const target = card?.dataset.nodeId;
  if (target) connectFrom(start.nodeId, start.handleId, target);
});

onNodeDragStop(({ node }) => {
  const current = props.flow.nodes.find(candidate => candidate.id === node.id);
  if (!current) return;
  // Um clique sem mover também termina um "drag": só vira edição se a posição mudou de fato.
  if ((current.x ?? 0) === node.position.x && (current.y ?? 0) === node.position.y) return;
  flows.moveNode(props.path, node.id, node.position.x, node.position.y);
});

onPaneClick(() => {
  emit("update:selectedId", null);
  emit("update:selectedEdge", null);
});

onEdgeClick(({ edge }) => {
  const flowEdge = (edge.data as { edge?: SelectedEdge } | undefined)?.edge;
  if (!flowEdge) return;
  emit("update:selectedId", null);
  emit("update:selectedEdge", {
    from: flowEdge.from,
    when: flowEdge.when,
    output: flowEdge.output,
  });
  wrapper.value?.focus();
});

// Um flow que já abre com nós é ajustado à tela uma vez; um flow vazio não: o primeiro nó
// solto não pode refazer o zoom e a posição que o usuário acabou de escolher.
let fitted = props.flow.nodes.length === 0;
onNodesInitialized(() => {
  if (fitted) return;
  fitted = true;
  void fitView({ padding: 0.15, maxZoom: 1 });
});

// --- Seleção e teclado -------------------------------------------------------------------------

function selectNode(id: string): void {
  emit("update:selectedId", id);
  emit("update:selectedEdge", null);
}

function onNodeKeydown(view: NodeView, event: KeyboardEvent): void {
  if (props.readOnly) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    flows.removeNode(props.path, view.node.id);
    emit("update:selectedId", null);
    return;
  }
  const step = event.shiftKey ? 20 : 0;
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const move = moves[event.key];
  if (move && step > 0) {
    event.preventDefault();
    flows.moveNode(
      props.path,
      view.node.id,
      (view.node.x ?? 0) + move[0],
      (view.node.y ?? 0) + move[1],
    );
  }
}

function onViewportKeydown(event: KeyboardEvent): void {
  const edge = props.selectedEdge;
  if (props.readOnly || !edge) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    flows.disconnect(props.path, edge.from, edge.when, edge.output);
    emit("update:selectedEdge", null);
  }
}

/** Focar um nó fora da vista faz o navegador rolar o contêiner `overflow-hidden`; o canvas se move por `transform`, então a rolagem volta a zero. */
function resetScroll(event: Event): void {
  const el = event.currentTarget as HTMLElement;
  el.scrollLeft = 0;
  el.scrollTop = 0;
}

// --- Portas de dados: arrastar um campo da resposta até uma `{{variável}}` ---------------------

interface PortDrag {
  nodeId: string;
  source: ValueSource;
}

let portDrag: PortDrag | null = null;
const portLine = ref<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);

function relativeToWrapper(clientX: number, clientY: number): { x: number; y: number } {
  const rect = wrapper.value?.getBoundingClientRect();
  return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
}

function onPortDown(view: NodeView, source: ValueSource, event: PointerEvent): void {
  if (event.button !== 0 || props.readOnly) return;
  event.stopPropagation();
  event.preventDefault();
  portDrag = { nodeId: view.node.id, source };
  const start = relativeToWrapper(event.clientX, event.clientY);
  portLine.value = { from: start, to: start };
  window.addEventListener("pointermove", onPortMove);
  window.addEventListener("pointerup", onPortUp);
}

function onPortMove(event: PointerEvent): void {
  if (!portLine.value) return;
  portLine.value = { ...portLine.value, to: relativeToWrapper(event.clientX, event.clientY) };
}

function onPortUp(event: PointerEvent): void {
  const current = portDrag;
  portDrag = null;
  portLine.value = null;
  window.removeEventListener("pointermove", onPortMove);
  window.removeEventListener("pointerup", onPortUp);
  if (!current) return;
  const port = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>("[data-in-port]");
  const variable = port?.dataset.variable;
  const targetNode = port?.dataset.nodeId;
  if (variable && targetNode && targetNode !== current.nodeId) {
    flows.addMapping(props.path, formatMappingSource(current.nodeId, current.source), variable);
  }
}

function portLinePath(): string {
  const line = portLine.value;
  if (!line) return "";
  const dx = Math.max(40, Math.abs(line.to.x - line.from.x) / 2);
  return `M ${line.from.x} ${line.from.y} C ${line.from.x + dx} ${line.from.y}, ${line.to.x - dx} ${line.to.y}, ${line.to.x} ${line.to.y}`;
}

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPortMove);
  window.removeEventListener("pointerup", onPortUp);
});

// --- Soltar uma request da árvore no canvas ----------------------------------------------------

function onTreeDrop(event: Event): void {
  const detail = (event as CustomEvent<{ path: string; x: number; y: number }>).detail;
  const rect = wrapper.value?.getBoundingClientRect();
  if (!rect || props.readOnly) return;
  if (
    detail.x < rect.left ||
    detail.x > rect.right ||
    detail.y < rect.top ||
    detail.y > rect.bottom
  ) {
    return;
  }
  const at = screenToFlowCoordinate({ x: detail.x, y: detail.y });
  const id = flows.addRequestNode(props.path, detail.path, {
    at: { x: at.x - NODE_WIDTH / 2, y: at.y - HEADER_H / 2 },
  });
  if (id) emit("update:selectedId", id);
}

onMounted(() => window.addEventListener("wttp:tree-drop", onTreeDrop));
onBeforeUnmount(() => window.removeEventListener("wttp:tree-drop", onTreeDrop));

// Portas de saída vêm da última resposta conhecida: busca no histórico o que ainda não se sabe.
watch(
  () => props.flow.nodes.map(node => node.request).join("|"),
  () => {
    for (const node of props.flow.nodes) {
      if (node.type === "request" && node.request) void flows.ensureSample(node.request);
    }
  },
  { immediate: true },
);

const STATE_CLASS: Record<string, string> = {
  idle: "border-subtle",
  pending: "border-subtle opacity-60",
  running: "border-accent ring-1 ring-accent",
  ok: "border-status-2xx/60",
  failed: "border-status-5xx",
  skipped: "border-subtle opacity-40",
};

const TYPE_ICON: Record<string, string> = {
  condition: "split",
  pollUntil: "repeat",
  delay: "timer",
  function: "braces",
};

function resultOf(id: string): ReturnType<typeof flows.runOf>["results"][string] | undefined {
  return run.value.results[id];
}

const outputTop = (index: number): number => 12 + (index - 1) * OUTPUT_ROW_H + OUTPUT_ROW_H / 2 - 6;
const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100));
</script>

<template>
  <div
    ref="wrapper"
    class="relative size-full select-none overflow-hidden bg-surface-1 text-faint/30"
    :style="{
      backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
      backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px`,
      backgroundPosition: `${viewport.x}px ${viewport.y}px`,
    }"
    data-testid="flow-canvas"
    tabindex="-1"
    @scroll="resetScroll"
    @keydown="onViewportKeydown"
  >
    <VueFlow
      :id="flowId"
      :nodes="vfNodes"
      :edges="vfEdges"
      :min-zoom="0.3"
      :max-zoom="1.8"
      :default-viewport="{ x: 40, y: 40, zoom: 1 }"
      :snap-to-grid="true"
      :snap-grid="[20, 20]"
      :nodes-draggable="!readOnly"
      :nodes-connectable="!readOnly"
      :nodes-focusable="false"
      :edges-focusable="false"
      :elements-selectable="false"
      :disable-keyboard-a11y="true"
      :delete-key-code="null"
      :selection-key-code="null"
      :multi-selection-key-code="null"
      :zoom-on-double-click="false"
      :connection-radius="28"
      :auto-pan-on-connect="false"
      :auto-pan-on-node-drag="false"
      class="!bg-transparent"
    >
      <!-- Nó: um só tipo visual, que muda conforme `data.node.type` -->
      <template #node-flow="{ data }">
        <div
          class="rounded-lg border bg-surface-2 text-1 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          :class="[
            showStates ? STATE_CLASS[data.state] : 'border-subtle',
            selectedId === data.node.id ? 'ring-2 ring-focus' : '',
            readOnly ? '' : 'cursor-grab',
          ]"
          :style="{ width: `${NODE_WIDTH}px` }"
          :data-node-id="data.node.id"
          :data-state="data.state"
          :data-node-type="data.node.type"
          :aria-label="`${data.title} (${data.node.id})`"
          role="button"
          tabindex="0"
          data-testid="flow-canvas-node"
          @pointerdown="selectNode(data.node.id)"
          @focus="selectNode(data.node.id)"
          @keydown="onNodeKeydown(data, $event)"
        >
          <!-- Entrada, e as portas invisíveis onde terminam/começam as linhas de mapeamento -->
          <Handle
            id="in"
            type="target"
            :position="Position.Left"
            :style="{ top: '50%' }"
            class="!size-3 !rounded-full !border !border-strong !bg-surface-3"
            data-testid="flow-in-handle"
          />
          <Handle
            id="map-in"
            type="target"
            :position="Position.Left"
            :connectable="false"
            :style="{ top: 'calc(50% + 10px)' }"
            class="!pointer-events-none !opacity-0"
          />
          <Handle
            id="map-out"
            type="source"
            :position="Position.Right"
            :connectable="false"
            :style="{ top: 'calc(50% + 10px)' }"
            class="!pointer-events-none !opacity-0"
          />

          <div
            class="flex items-center gap-2 px-3"
            :style="{ minHeight: `${data.headerHeight}px` }"
          >
            <WMethodBadge
              v-if="data.method"
              :method="data.method"
              class="w-10 shrink-0 text-[11px]"
            />
            <WIcon
              v-else-if="data.broken"
              name="triangle-alert"
              size="4"
              class="shrink-0 text-status-4xx"
            />
            <WIcon
              v-else
              :name="TYPE_ICON[data.node.type] ?? 'circle'"
              size="4"
              class="shrink-0 text-accent"
            />
            <div class="min-w-0 flex-1" :class="data.node.type === 'function' ? 'pr-5' : ''">
              <p class="truncate font-inter text-[13px] font-medium">{{ data.title }}</p>
              <p class="truncate font-mono text-[10px] text-faint" :title="data.node.request">
                {{ data.node.id
                }}<template v-if="summaryOf(data.node)"> · {{ summaryOf(data.node) }}</template>
              </p>
            </div>

            <WIcon
              v-if="data.state === 'running'"
              name="loader-circle"
              class="shrink-0 animate-spin text-accent"
            />
            <template v-else-if="resultOf(data.node.id) && showStates">
              <WStatusBadge
                v-if="resultOf(data.node.id)!.result"
                :code="resultOf(data.node.id)!.result!.status"
                class="shrink-0 text-[11px]"
              />
              <WIcon
                :name="resultOf(data.node.id)!.passed ? 'circle-check' : 'circle-x'"
                :class="resultOf(data.node.id)!.passed ? 'text-status-2xx' : 'text-status-5xx'"
                class="shrink-0"
              />
            </template>
            <WIcon v-else-if="data.state === 'pending'" name="clock" class="shrink-0 text-faint" />
          </div>

          <!-- Portas de dados: variáveis que a request usa (entrada) e campos da última resposta (saída) -->
          <div
            v-if="showPorts && data.node.type === 'request'"
            class="nodrag nopan grid cursor-default grid-cols-2 gap-2 border-t border-subtle px-2 py-1.5"
            data-testid="flow-ports"
          >
            <ul
              class="flex flex-col gap-0.5 overflow-y-auto"
              :style="{ maxHeight: `${MAX_PORT_ROWS * PORT_ROW_H}px` }"
            >
              <li v-if="data.inputs.length === 0" class="font-inter text-[10px] text-faint">
                {{ t("flows.noInputs") }}
              </li>
              <li
                v-for="name in data.inputs"
                :key="name"
                class="flex h-5 items-center gap-1 rounded bg-surface-3/60 px-1.5 font-mono text-[11px] text-muted"
                :data-node-id="data.node.id"
                :data-variable="name"
                data-in-port
                data-testid="flow-in-port"
              >
                <span class="size-1.5 shrink-0 rounded-full bg-status-2xx" />
                <span class="truncate">{{ name }}</span>
              </li>
            </ul>
            <ul
              class="flex flex-col gap-0.5 overflow-y-auto"
              :style="{ maxHeight: `${MAX_PORT_ROWS * PORT_ROW_H}px` }"
            >
              <li
                v-if="data.outputs.length === 0"
                class="text-right font-inter text-[10px] text-faint"
              >
                {{ t("flows.noOutputs") }}
              </li>
              <li
                v-for="port in data.outputs"
                :key="port.id"
                class="flex h-5 cursor-crosshair items-center justify-end gap-1 rounded bg-surface-3/60 px-1.5 font-mono text-[11px] text-muted hover:text-1"
                :title="`${port.label} = ${port.preview}`"
                data-testid="flow-out-port"
                :data-port="port.id"
                @pointerdown="onPortDown(data, port.source, $event)"
              >
                <span class="truncate">{{ port.label }}</span>
                <span class="size-1.5 shrink-0 rounded-full bg-accent" />
              </li>
            </ul>
          </div>

          <!-- Saídas: uma, true/false numa condição, ou N numeradas numa função -->
          <template v-if="data.node.type === 'condition'">
            <Handle
              id="out-true"
              type="source"
              :position="Position.Right"
              :style="{ top: '16px' }"
              :title="t('flows.true')"
              class="!size-3 !rounded-full !border !border-status-2xx !bg-surface-3"
              data-testid="flow-out-handle"
              data-when="true"
            />
            <Handle
              id="out-false"
              type="source"
              :position="Position.Right"
              :style="{ top: '38px' }"
              :title="t('flows.false')"
              class="!size-3 !rounded-full !border !border-status-5xx !bg-surface-3"
              data-testid="flow-out-handle"
              data-when="false"
            />
          </template>
          <template v-else-if="data.node.type === 'function'">
            <template v-for="n in data.fnOutputs" :key="n">
              <span
                class="pointer-events-none absolute right-3 font-mono text-[10px] text-faint"
                :style="{ top: `${outputTop(n) - 1}px` }"
                >{{ n }}</span
              >
              <Handle
                :id="`out-${n}`"
                type="source"
                :position="Position.Right"
                :style="{ top: `${outputTop(n) + 6}px` }"
                :title="t('flows.outputN', { n })"
                class="!size-3 !rounded-full !border !border-strong !bg-surface-3"
                data-testid="flow-out-handle"
                :data-output="n"
              />
            </template>
          </template>
          <Handle
            v-else
            id="out"
            type="source"
            :position="Position.Right"
            :style="{ top: '50%' }"
            :title="t('flows.connect')"
            class="!size-3 !rounded-full !border !border-strong !bg-surface-3"
            data-testid="flow-out-handle"
          />
        </div>
      </template>

      <!-- Aresta: a ordem de execução. Cor por token, nunca a da lib. -->
      <template #edge-flow="edgeProps">
        <g :class="edgeTone(edgeProps.data)" data-testid="flow-edge">
          <BaseEdge
            :id="edgeProps.id"
            :path="pathOf(edgeProps)"
            :interaction-width="16"
            :style="{
              stroke: 'currentColor',
              strokeWidth: edgeProps.data.selected ? 3 : 2,
              cursor: 'pointer',
            }"
          />
          <text
            v-if="edgeProps.data.label"
            :x="edgeProps.sourceX + 14"
            :y="edgeProps.sourceY - 4"
            font-size="11"
            fill="currentColor"
            class="font-mono"
            :class="
              edgeProps.data.edge.when === undefined
                ? 'text-muted'
                : edgeProps.data.positive
                  ? 'text-status-2xx'
                  : 'text-status-5xx'
            "
          >
            {{ edgeProps.data.label }}
          </text>
        </g>
      </template>

      <!-- Mapeamento: tracejado, do nó de origem ao que usa a variável -->
      <template #edge-mapping="edgeProps">
        <g class="text-status-2xx" data-testid="flow-mapping-line">
          <BaseEdge
            :id="edgeProps.id"
            :path="pathOf(edgeProps)"
            :interaction-width="0"
            :style="{
              stroke: 'currentColor',
              strokeWidth: 1.5,
              strokeDasharray: '5 4',
              opacity: 0.8,
              pointerEvents: 'none',
            }"
          />
          <text
            :x="(edgeProps.sourceX + edgeProps.targetX) / 2"
            :y="(edgeProps.sourceY + edgeProps.targetY) / 2 + 12"
            font-size="11"
            fill="currentColor"
            text-anchor="middle"
            class="font-mono"
          >
            {{ edgeProps.data.name }}
          </text>
        </g>
      </template>

      <!-- A linha enquanto se arrasta de uma saída: tracejada, na cor de destaque -->
      <template
        #connection-line="{ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }"
      >
        <path
          :d="
            getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })[0]
          "
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-dasharray="4 4"
          class="text-accent"
        />
      </template>
    </VueFlow>

    <!-- A linha enquanto se arrasta de uma porta de dados até uma variável -->
    <svg
      v-if="portLine"
      class="pointer-events-none absolute inset-0 size-full text-status-2xx"
      aria-hidden="true"
    >
      <path
        :d="portLinePath()"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-dasharray="4 4"
      />
    </svg>

    <p
      v-if="flow.nodes.length === 0"
      class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-inter text-sm text-faint"
    >
      {{ t("flows.canvasEmpty") }}
    </p>

    <div
      class="absolute bottom-3 left-3 flex items-center gap-1 rounded-md border border-subtle bg-surface-2 p-1"
    >
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-1"
        :title="t('flows.zoomOut')"
        :aria-label="t('flows.zoomOut')"
        @click="zoomOut()"
      >
        <WIcon name="minus" />
      </button>
      <span class="w-10 text-center font-mono text-[11px] text-muted" data-testid="flow-zoom">
        {{ zoomPercent }}%
      </span>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-1"
        :title="t('flows.zoomIn')"
        :aria-label="t('flows.zoomIn')"
        @click="zoomIn()"
      >
        <WIcon name="plus" />
      </button>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-1"
        :title="t('flows.fit')"
        :aria-label="t('flows.fit')"
        data-testid="flow-fit"
        @click="fitView({ padding: 0.15, maxZoom: 1 })"
      >
        <WIcon name="maximize" />
      </button>
    </div>
  </div>
</template>

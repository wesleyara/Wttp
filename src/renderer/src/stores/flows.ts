import type {
  FlowEdge,
  FlowEvent,
  FlowFile,
  FlowListItem,
  FlowNode,
  FlowNodeResult,
  FlowNodeType,
  FlowPlanNode,
  FlowResponseSample,
  FlowRunSummary,
  FlowValidationIssue,
  WorkspaceNode,
  WttpError,
} from "@shared";
import type { Condition } from "@shared/condition";

import { i18n } from "@renderer/i18n";
import { useEnvironmentStore } from "@renderer/stores/environment";
import { isFlowTab, useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useToastStore } from "@renderer/stores/toast";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { MAX_FUNCTION_OUTPUTS } from "@shared/flow";
import { defineStore } from "pinia";
import { computed, ref, toRaw, watch } from "vue";

/** Tira a reatividade do Pinia antes de cruzar a ponte de IPC — Proxy reativo não é clonável pelo Electron. */
function unwrap<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T;
}

export type FlowRunStatus = "idle" | "running" | "finished" | "failed";

/** Como o canvas pinta um nó durante e depois de um run. */
export type NodeVisualState = "idle" | "pending" | "running" | "ok" | "failed" | "skipped";

/** Estado do último run de um flow — por arquivo, sobrevive a fechar e reabrir a aba. */
export interface FlowRunState {
  status: FlowRunStatus;
  runId: string | null;
  plan: FlowPlanNode[];
  /** Por `id` de nó — a execução mais recente de cada um. */
  results: Record<string, FlowNodeResult>;
  /** Nó em execução agora. */
  running: string | null;
  /** Ordem em que os nós rodaram, repetições incluídas — o caminho percorrido. */
  order: string[];
  summary: FlowRunSummary | null;
  error: WttpError | null;
  issues: FlowValidationIssue[];
  stopping: boolean;
}

function idleState(): FlowRunState {
  return {
    status: "idle",
    runId: null,
    plan: [],
    results: {},
    running: null,
    order: [],
    summary: null,
    error: null,
    issues: [],
    stopping: false,
  };
}

/** Uma request do workspace que pode virar nó de um flow. */
export interface RequestOption {
  path: string;
  name: string;
  method: string;
  /** Pasta que contém a request, para distinguir homônimas. */
  folder: string;
}

export function requestOptions(nodes: WorkspaceNode[], folder = ""): RequestOption[] {
  const out: RequestOption[] = [];
  for (const node of nodes) {
    if (node.kind === "request") {
      if (node.data) {
        out.push({ path: node.path, name: node.name, method: node.data.method, folder });
      }
    } else {
      out.push(...requestOptions(node.children, folder ? `${folder} / ${node.name}` : node.name));
    }
  }
  return out;
}

/** Id de nó a partir de um nome, único no flow (`login`, `login-2`...). */
export function uniqueNodeId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "node";
  let candidate = base;
  for (let n = 2; used.has(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}

export const NODE_WIDTH = 224;
const GRID = 20;
const snap = (value: number): number => Math.round(value / GRID) * GRID;

/** Ponto de partida de um nó de função novo: mostra o que o código recebe e como escolher a saída. */
export const DEFAULT_FUNCTION_CODE = `// res  = a última resposta (status, headers, body, json)
// vars = as variáveis do flow — o que você escrever aqui vale como {{nome}} nos próximos nós
// return N escolhe a saída N; return nada para o flow terminar aqui.
return 1;
`;

function defaultCondition(type: "condition" | "pollUntil"): Condition {
  return type === "condition"
    ? { source: "status", op: "eq", value: "200" }
    : { source: "body", path: "status", op: "eq", value: "done" };
}

/**
 * Flows: lista, edição com rascunho (o canvas edita na memória e salva com Ctrl+S, como
 * qualquer aba) e execução. A lista vem de `WorkspaceTree.flows`; o run acontece no main
 * (`flow:run`) e esta store guarda o que chega por `flow:event`.
 */
export const useFlowsStore = defineStore("flows", () => {
  const workspace = useWorkspaceStore();
  const environment = useEnvironmentStore();
  const tabs = useRequestTabsStore();
  const toast = useToastStore();

  const flows = computed<FlowListItem[]>(() => workspace.tree?.flows ?? []);
  const drafts = ref<Record<string, FlowFile>>({});
  const runs = ref<Record<string, FlowRunState>>({});
  const runIdToFlow = new Map<string, string>();
  /** Última resposta conhecida por request (`path`): da execução do flow ou do histórico — as "portas de saída". */
  const samples = ref<Record<string, FlowResponseSample>>({});
  const bail = ref(true);
  const delayMs = ref(0);
  const error = ref<WttpError | null>(null);

  const requests = computed(() => requestOptions(workspace.tree?.children ?? []));

  function find(path: string): FlowListItem | null {
    return flows.value.find(flow => flow.path === path) ?? null;
  }

  /** O flow como está na tela: o rascunho, se há edição não salva, senão o arquivo. */
  function current(path: string): FlowFile | null {
    return drafts.value[path] ?? find(path)?.data ?? null;
  }

  function isDirty(path: string): boolean {
    return path in drafts.value;
  }

  function runOf(path: string): FlowRunState {
    return runs.value[path] ?? idleState();
  }

  /** Nós cuja request não existe mais (ou está inválida) — avisados na UI antes de rodar. */
  function brokenNodeIds(flow: FlowFile): Set<string> {
    const valid = new Set(requests.value.map(request => request.path));
    return new Set(
      flow.nodes
        .filter(node => node.type === "request" && !(node.request && valid.has(node.request)))
        .map(node => node.id),
    );
  }

  // --- Edição (rascunho) -------------------------------------------------------------------

  function tabIdOf(path: string): string {
    return `__flow__:${path}`;
  }

  /** Aplica `change` a uma cópia do flow atual e guarda como rascunho. */
  function mutate(path: string, change: (draft: FlowFile) => void): boolean {
    const base = current(path);
    if (!base) return false;
    const draft = unwrap(base);
    change(draft);
    drafts.value = { ...drafts.value, [path]: draft };
    tabs.setDirty(tabIdOf(path), true);
    return true;
  }

  function nodeById(draft: FlowFile, id: string): FlowNode | undefined {
    return draft.nodes.find(node => node.id === id);
  }

  /**
   * Onde "Add" liga o nó novo: o último nó que ainda tem uma saída livre — sem aresta de saída
   * (um nó comum) ou com uma das saídas numeradas sem destino (uma função, que liga na menor
   * livre). Uma condição fica de fora: qual ramo seguir é escolha do usuário.
   */
  function openTail(draft: FlowFile): { node: FlowNode; output?: number } | undefined {
    const edges = draft.edges ?? [];
    for (const node of [...draft.nodes].reverse()) {
      if (node.type === "condition") continue;
      const outgoing = edges.filter(edge => edge.from === node.id);
      if (node.type !== "function") {
        if (outgoing.length === 0) return { node };
        continue;
      }
      const used = new Set(outgoing.map(edge => edge.output));
      for (let output = 1; output <= (node.outputs ?? 1); output++) {
        if (!used.has(output)) return { node, output };
      }
    }
    return undefined;
  }

  function linkTail(draft: FlowFile, to: string): void {
    const tail = openTail(draft);
    if (!tail || tail.node.id === to) return;
    const edge: FlowEdge = {
      from: tail.node.id,
      to,
      ...(tail.output !== undefined ? { output: tail.output } : {}),
    };
    setEdges(draft, [...(draft.edges ?? []), edge]);
  }

  function setEdges(draft: FlowFile, edges: FlowEdge[]): void {
    if (edges.length > 0) draft.edges = edges;
    else delete draft.edges;
  }

  /** Cria um nó de request. Sem `at`, entra à direita do último; `connect` liga o fim do fluxo a ele. */
  function addRequestNode(
    path: string,
    requestPath: string,
    options: { at?: { x: number; y: number }; connect?: boolean } = {},
  ): string | null {
    const option = requests.value.find(request => request.path === requestPath);
    if (!option) return null;
    let created: string | null = null;
    mutate(path, draft => {
      const id = uniqueNodeId(
        option.name,
        draft.nodes.map(node => node.id),
      );
      const last = draft.nodes[draft.nodes.length - 1];
      const at = options.at ?? { x: last ? (last.x ?? 0) + 280 : 0, y: last?.y ?? 0 };
      if (options.connect) linkTail(draft, id);
      draft.nodes.push({ id, type: "request", request: requestPath, x: snap(at.x), y: snap(at.y) });
      created = id;
    });
    return created;
  }

  function addControlNode(
    path: string,
    type: Exclude<FlowNodeType, "request">,
    options: { at?: { x: number; y: number }; connect?: boolean } = {},
  ): string | null {
    let created: string | null = null;
    mutate(path, draft => {
      const id = uniqueNodeId(
        type === "pollUntil" ? "poll-until" : type,
        draft.nodes.map(n => n.id),
      );
      const last = draft.nodes[draft.nodes.length - 1];
      const at = options.at ?? { x: last ? (last.x ?? 0) + 280 : 0, y: last?.y ?? 0 };
      const node: FlowNode = { id, type, x: snap(at.x), y: snap(at.y) };
      if (type === "condition") node.when = defaultCondition("condition");
      if (type === "pollUntil") {
        node.when = defaultCondition("pollUntil");
        node.intervalMs = 1000;
        node.maxAttempts = 10;
      }
      if (type === "delay") node.ms = 1000;
      if (type === "function") {
        node.outputs = 2;
        node.code = DEFAULT_FUNCTION_CODE;
      }
      if (options.connect) linkTail(draft, id);
      draft.nodes.push(node);
      created = id;
    });
    return created;
  }

  function removeNode(path: string, id: string): void {
    mutate(path, draft => {
      draft.nodes = draft.nodes.filter(node => node.id !== id);
      setEdges(
        draft,
        (draft.edges ?? []).filter(edge => edge.from !== id && edge.to !== id),
      );
      const mappings = (draft.mappings ?? []).filter(
        mapping => !mapping.from.startsWith(`${id}.res.`),
      );
      if (mappings.length > 0) draft.mappings = mappings;
      else delete draft.mappings;
      if (draft.start === id) delete draft.start;
    });
  }

  function moveNode(path: string, id: string, x: number, y: number): void {
    mutate(path, draft => {
      const node = nodeById(draft, id);
      if (node) {
        node.x = snap(x);
        node.y = snap(y);
      }
    });
  }

  function updateNode(path: string, id: string, patch: Partial<FlowNode>): void {
    mutate(path, draft => {
      const node = nodeById(draft, id);
      if (node) Object.assign(node, patch);
    });
  }

  /** Liga a saída `from` (`when` = qual das duas de uma condição) à entrada `to`. Uma saída tem um destino só: ligar de novo troca. */
  function connect(
    path: string,
    from: string,
    to: string,
    when?: boolean,
    output?: number,
  ): boolean {
    if (from === to) return false;
    return mutate(path, draft => {
      const source = nodeById(draft, from);
      if (!source || !nodeById(draft, to)) return;
      const edge: FlowEdge = {
        from,
        to,
        ...(source.type === "condition" ? { when: when ?? true } : {}),
        ...(source.type === "function" ? { output: output ?? 1 } : {}),
      };
      setEdges(draft, [
        ...(draft.edges ?? []).filter(
          existing =>
            !(
              existing.from === from &&
              existing.when === edge.when &&
              existing.output === edge.output
            ),
        ),
        edge,
      ]);
    });
  }

  function disconnect(path: string, from: string, when?: boolean, output?: number): void {
    mutate(path, draft => {
      setEdges(
        draft,
        (draft.edges ?? []).filter(
          edge => !(edge.from === from && edge.when === when && edge.output === output),
        ),
      );
    });
  }

  /** Muda quantas saídas a função tem — as arestas das saídas que deixam de existir saem junto. */
  function setFunctionOutputs(path: string, id: string, outputs: number): void {
    const count = Math.min(MAX_FUNCTION_OUTPUTS, Math.max(1, Math.trunc(outputs)));
    mutate(path, draft => {
      const node = nodeById(draft, id);
      if (!node) return;
      node.outputs = count;
      setEdges(
        draft,
        (draft.edges ?? []).filter(
          edge => !(edge.from === id && edge.output !== undefined && edge.output > count),
        ),
      );
    });
  }

  function setStart(path: string, id: string | null): void {
    mutate(path, draft => {
      if (id && draft.nodes[0]?.id !== id) draft.start = id;
      else delete draft.start;
    });
  }

  function addMapping(path: string, from: string, to: string): boolean {
    const flow = current(path);
    if (!flow || (flow.mappings ?? []).some(m => m.from === from && m.to === to)) return false;
    return mutate(path, draft => {
      draft.mappings = [...(draft.mappings ?? []), { from, to }];
    });
  }

  function removeMapping(path: string, from: string, to: string): void {
    mutate(path, draft => {
      const mappings = (draft.mappings ?? []).filter(m => !(m.from === from && m.to === to));
      if (mappings.length > 0) draft.mappings = mappings;
      else delete draft.mappings;
    });
  }

  // --- Salvar / descartar ------------------------------------------------------------------

  async function save(path: string): Promise<boolean> {
    const root = workspace.root;
    const draft = drafts.value[path];
    if (!root || !draft) return true;
    error.value = null;
    let saved: FlowListItem;
    try {
      saved = await window.wttp.flow.save({ root, path, flow: unwrap(draft) });
    } catch (caught) {
      error.value = caught as WttpError;
      return false;
    }
    // Coloca o que acabou de ser gravado na árvore **antes** de largar o rascunho: sem isso, até
    // a releitura do disco terminar o flow "voltava" ao estado antigo (um flow novo, vazio) e o
    // canvas piscava sem nós — e um Run nessa janela rodaria o flow vazio.
    if (workspace.tree) {
      const list = workspace.tree.flows ?? [];
      workspace.tree = {
        ...workspace.tree,
        flows: list.some(item => item.path === path)
          ? list.map(item => (item.path === path ? saved : item))
          : [...list, saved],
      };
    }
    dropDraft(path);
    tabs.setDirty(tabIdOf(path), false);
    await workspace.refreshTree();
    toast.push(i18n.global.t("toast.flowSaved", { name: draft.name }), "success");
    return true;
  }

  function dropDraft(path: string): void {
    const rest = { ...drafts.value };
    delete rest[path];
    drafts.value = rest;
  }

  function discard(path: string): void {
    dropDraft(path);
    tabs.setDirty(tabIdOf(path), false);
  }

  tabs.registerTabHandler("flow", {
    save: async tab => {
      await save(tab.path.slice("flows/".length));
    },
    discard: tab => discard(tab.path.slice("flows/".length)),
  });

  // Aba fechada sem salvar (descartando): o rascunho some junto — reabrir mostra o arquivo.
  watch(
    () => tabs.tabs.filter(isFlowTab).map(tab => tab.path),
    open => {
      for (const path of Object.keys(drafts.value)) {
        if (!open.includes(`flows/${path}`)) discard(path);
      }
    },
  );

  // --- CRUD de arquivo ---------------------------------------------------------------------

  async function mutateDisk<T>(action: (root: string) => Promise<T>): Promise<T | null> {
    const root = workspace.root;
    if (!root) return null;
    error.value = null;
    try {
      const result = await action(root);
      await workspace.refreshTree();
      return result;
    } catch (caught) {
      error.value = caught as WttpError;
      return null;
    }
  }

  async function create(): Promise<FlowListItem | null> {
    const t = i18n.global.t;
    const names = new Set(flows.value.map(flow => flow.name));
    let name = t("flows.newName");
    for (let n = 2; names.has(name); n++) name = `${t("flows.newName")} ${n}`;
    const item = await mutateDisk(root => window.wttp.flow.create({ root, name }));
    if (item) {
      toast.push(t("toast.flowCreated", { name: item.name }), "success");
      tabs.openFlowTab(item.path, item.name);
    }
    return item;
  }

  function open(path: string): void {
    const item = find(path);
    if (item) tabs.openFlowTab(item.path, item.name);
  }

  async function rename(path: string, name: string): Promise<FlowListItem | null> {
    const trimmed = name.trim();
    const item = find(path);
    if (!trimmed || !item || trimmed === item.name) return item;
    // O nome vive no arquivo: o que está no rascunho vai junto, para a renomeação não perdê-lo.
    const draft = drafts.value[path];
    if (draft) {
      const saved = await save(path);
      if (!saved) return item;
    }
    const renamed = await mutateDisk(root =>
      window.wttp.flow.rename({ root, path, name: trimmed }),
    );
    if (renamed) {
      if (runs.value[path]) {
        runs.value[renamed.path] = runs.value[path];
        delete runs.value[path];
      }
      const wasActive = tabs.active?.id === tabIdOf(path);
      tabs.closeByPath(`flows/${path}`);
      if (wasActive) tabs.openFlowTab(renamed.path, renamed.name);
    }
    return renamed;
  }

  async function remove(path: string): Promise<boolean> {
    const name = find(path)?.name ?? path;
    discard(path);
    const ok = await mutateDisk(root => window.wttp.flow.delete({ root, path }));
    if (ok === null) return false;
    tabs.closeByPath(`flows/${path}`);
    delete runs.value[path];
    toast.push(i18n.global.t("toast.flowDeleted", { name }), "warning");
    return true;
  }

  // --- Amostras de resposta (as portas de saída) -------------------------------------------

  async function ensureSample(requestPath: string): Promise<void> {
    const root = workspace.root;
    if (!root || samples.value[requestPath]) return;
    try {
      const entries = await window.wttp.history.list({ root, path: requestPath });
      const hit = entries.find(entry => entry.response.ok);
      if (hit && hit.response.ok && !samples.value[requestPath]) {
        samples.value = {
          ...samples.value,
          [requestPath]: {
            status: hit.response.status,
            headers: hit.response.headers,
            body: hit.response.body,
            bodyTruncated: hit.response.bodyTruncated,
          },
        };
      }
    } catch {
      // Sem histórico, a request só não mostra portas de saída até o flow rodar.
    }
  }

  // --- Execução ----------------------------------------------------------------------------

  function onEvent(event: FlowEvent): void {
    const path = runIdToFlow.get(event.runId);
    const state = path ? runs.value[path] : undefined;
    if (!path || !state) return;
    switch (event.type) {
      case "started":
        state.plan = event.nodes;
        break;
      case "nodeStarted":
        state.running = event.nodeId;
        break;
      case "nodeFinished": {
        state.results[event.node.nodeId] = event.node;
        state.order.push(event.node.nodeId);
        state.running = null;
        const requestPath = current(path)?.nodes.find(n => n.id === event.node.nodeId)?.request;
        if (requestPath && event.node.response) {
          samples.value = { ...samples.value, [requestPath]: event.node.response };
        }
        break;
      }
      case "finished":
        state.status = "finished";
        state.summary = event.summary;
        state.running = null;
        state.stopping = false;
        runIdToFlow.delete(event.runId);
        break;
      case "failed":
        state.status = "failed";
        state.error = event.error;
        state.issues = event.issues ?? [];
        state.running = null;
        state.stopping = false;
        runIdToFlow.delete(event.runId);
        break;
    }
  }

  let unsubscribe: (() => void) | null = null;
  if (typeof window !== "undefined" && window.wttp?.flow) {
    unsubscribe = window.wttp.flow.onEvent(onEvent);
  }

  /** Roda o que está na tela — salvo ou não. */
  async function run(path: string): Promise<void> {
    const root = workspace.root;
    const flow = current(path);
    if (!root || !flow || runOf(path).status === "running") return;
    runs.value[path] = { ...idleState(), status: "running" };
    try {
      const { runId } = await window.wttp.flow.run({
        root,
        path,
        environmentPath: environment.activePath,
        bail: bail.value,
        delayMs: delayMs.value,
        flow: unwrap(flow),
      });
      runs.value[path].runId = runId;
      runIdToFlow.set(runId, path);
    } catch (caught) {
      runs.value[path] = { ...idleState(), status: "failed", error: caught as WttpError };
    }
  }

  async function stop(path: string): Promise<void> {
    const state = runs.value[path];
    if (!state?.runId || state.status !== "running") return;
    state.stopping = true;
    await window.wttp.flow.stop(state.runId);
  }

  /** Estado visual de um nó: o que o canvas pinta enquanto roda e depois. */
  function visualState(path: string, id: string): NodeVisualState {
    const state = runs.value[path];
    if (!state || state.status === "idle") return "idle";
    if (state.running === id) return "running";
    const result = state.results[id];
    if (result) return result.passed ? "ok" : "failed";
    return state.status === "running" ? "pending" : "skipped";
  }

  return {
    flows,
    drafts,
    runs,
    samples,
    bail,
    delayMs,
    error,
    requests,
    find,
    current,
    isDirty,
    runOf,
    brokenNodeIds,
    visualState,
    addRequestNode,
    addControlNode,
    removeNode,
    moveNode,
    updateNode,
    connect,
    disconnect,
    setFunctionOutputs,
    setStart,
    addMapping,
    removeMapping,
    save,
    discard,
    create,
    open,
    rename,
    remove,
    ensureSample,
    run,
    stop,
    dispose: () => unsubscribe?.(),
  };
});

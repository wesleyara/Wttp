import type {
  FolderNode,
  KeyValueEntry,
  ResolveRequestPayload,
  ResolveRequestResultPayload,
  ResolveTextResultPayload,
  VariableScopePayload,
} from "@shared";

import { useEnvironmentStore } from "@renderer/stores/environment";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref, toRaw, watch } from "vue";

/** Tira a reatividade do Pinia antes de cruzar a ponte de IPC — Proxy reativo não é clonável pelo Electron. */
function unwrap<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T;
}

/**
 * Escopo de variáveis do workspace aberto (EP-06-T01/T05) e a ponte com o resolvedor
 * puro do main (`variables:resolveText`/`variables:resolveRequest`). Não depende de
 * `useRequestTabsStore` — recebe o `path` da request como parâmetro em vez de ler a
 * aba ativa, para as duas stores não formarem um ciclo de import.
 */
export const useVariablesStore = defineStore("variables", () => {
  const workspace = useWorkspaceStore();
  const environment = useEnvironmentStore();

  /** Valor real das variáveis `secret: true` do environment ativo, buscado no keychain (nunca no YAML). */
  const secretValues = ref<Map<string, string>>(new Map());

  function secretKey(varName: string): string {
    return `wttp:${workspace.root}:${environment.activePath}:${varName}`;
  }

  async function refreshSecrets(): Promise<void> {
    const active = environment.active;
    const secretVars = (active?.data.variables ?? []).filter(variable => variable.secret);
    if (secretVars.length === 0) {
      secretValues.value = new Map();
      return;
    }

    const entries = await Promise.all(
      secretVars.map(
        async variable =>
          [variable.name, (await window.wttp.secret.get(secretKey(variable.name))) ?? ""] as const,
      ),
    );
    secretValues.value = new Map(entries);
  }

  watch(
    () => environment.active?.path,
    () => void refreshSecrets(),
    { immediate: true },
  );

  const environmentScope = computed<KeyValueEntry[]>(() => {
    const active = environment.active;
    if (!active) return [];
    return (active.data.variables ?? []).map(variable =>
      variable.secret
        ? { ...variable, value: secretValues.value.get(variable.name) ?? "" }
        : variable,
    );
  });

  /** Variáveis de `folder.yaml` na cadeia até a request, pasta mais próxima primeiro (vence — docs/file-format.md §8). */
  function collectionScope(requestPath: string): KeyValueEntry[] {
    const tree = workspace.tree;
    if (!tree) return [];

    const segments = requestPath.split("/").slice(0, -1);
    let siblings = tree.children;
    let currentPath = "";
    const chain: FolderNode[] = [];

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const folder = siblings.find(
        (node): node is FolderNode => node.kind === "folder" && node.path === currentPath,
      );
      if (!folder) break;
      chain.push(folder);
      siblings = folder.children;
    }

    return chain.reverse().flatMap(folder => folder.data?.variables ?? []);
  }

  function scopeFor(requestPath: string): VariableScopePayload {
    return {
      runtime: {},
      environment: environmentScope.value,
      collection: collectionScope(requestPath),
      workspace: workspace.tree?.data?.variables ?? [],
    };
  }

  const DYNAMIC_NAMES = ["$uuid", "$timestamp", "$isoTimestamp", "$randomInt"];

  /** Nomes disponíveis para autocomplete (EP-06-T05) — variáveis de usuário nos quatro níveis, mais as dinâmicas. */
  function variableNamesFor(requestPath: string): string[] {
    const scope = scopeFor(requestPath);
    const names = new Set<string>(DYNAMIC_NAMES);
    for (const entry of [
      ...(scope.environment ?? []),
      ...(scope.collection ?? []),
      ...(scope.workspace ?? []),
    ]) {
      names.add(entry.name);
    }
    return [...names];
  }

  function resolveText(text: string, requestPath: string): Promise<ResolveTextResultPayload> {
    return window.wttp.variables.resolveText({ text, scope: unwrap(scopeFor(requestPath)) });
  }

  function resolveRequestSpec(
    request: ResolveRequestPayload["request"],
    requestPath: string,
  ): Promise<ResolveRequestResultPayload> {
    return window.wttp.variables.resolveRequest({
      request: unwrap(request),
      scope: unwrap(scopeFor(requestPath)),
    });
  }

  return { scopeFor, variableNamesFor, resolveText, resolveRequestSpec, refreshSecrets };
});

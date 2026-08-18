import type {
  AuthConfig,
  FolderNode,
  KeyValueEntry,
  ResolveAuthChainResultPayload,
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

/** Rótulo exibido no modo `inherit` da Aba Auth (EP-07-T03) para o elo de `authChain` que forneceu a auth efetiva — `chain[0]` é sempre a própria request. */
export interface EffectiveAuthSource {
  /** `"request"` quando a própria request define a auth; `"folder"` quando vem de uma pasta/collection; `"none"` quando ninguém na cadeia define nada. */
  kind: "request" | "folder" | "none";
  label: string;
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

  /** Pastas na cadeia entre a raiz da collection e `requestPath`, pasta mais próxima da request primeiro — base de `collectionScope` (EP-06) e `authChain` (EP-07-T01). */
  function folderChain(requestPath: string): FolderNode[] {
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

    return chain.reverse();
  }

  /** Variáveis de `folder.yaml` na cadeia até a request, pasta mais próxima primeiro (vence — docs/file-format.md §8). */
  function collectionScope(requestPath: string): KeyValueEntry[] {
    return folderChain(requestPath).flatMap(folder => folder.data?.variables ?? []);
  }

  /**
   * Muda de referência sempre que qualquer camada de variável muda — environment
   * ativo/lista, ou a árvore do workspace (variáveis de workspace/pasta). `useVariablePreview`
   * observa isso pra re-resolver mesmo quando o texto do campo em si não mudou (EP-06.1)
   * — sem isso, editar uma variável em outro lugar deixava o destaque de "não resolvida"
   * preso até o usuário digitar de novo no campo afetado.
   */
  const scopeSignal = computed(() => [environment.activePath, environment.items, workspace.tree]);

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

  /**
   * Cadeia de auth da request até a raiz da collection (EP-07-T01), mesma ordem de
   * `folderChain`: `chain[0]` é a auth da própria request, o resto é `folder.auth` de
   * cada pasta, mais próxima primeiro. `undefined` = pasta sem `folder.yaml`/sem
   * `auth` — o resolvedor no main trata como `inherit`.
   */
  function authChain(requestPath: string, requestAuth: AuthConfig): (AuthConfig | undefined)[] {
    return [requestAuth, ...folderChain(requestPath).map(folder => folder.data?.auth)];
  }

  /** Resolve a herança de auth (EP-07-T01) e devolve também de onde ela veio, para o modo `inherit` da Aba Auth (EP-07-T03/T04) mostrar a origem em vez da palavra "inherit". */
  async function resolveEffectiveAuth(
    requestPath: string,
    requestAuth: AuthConfig,
  ): Promise<{ resolution: ResolveAuthChainResultPayload; source: EffectiveAuthSource }> {
    const folders = folderChain(requestPath);
    const chain = authChain(requestPath, requestAuth);
    const resolution = await window.wttp.variables.resolveAuthChain({ chain: unwrap(chain) });

    const source: EffectiveAuthSource =
      resolution.sourceIndex === null
        ? { kind: "none", label: "No auth configured" }
        : resolution.sourceIndex === 0
          ? { kind: "request", label: "This request" }
          : {
              kind: "folder",
              label: folders[resolution.sourceIndex - 1]?.name ?? "Collection",
            };

    return { resolution, source };
  }

  return {
    scopeFor,
    scopeSignal,
    variableNamesFor,
    resolveText,
    resolveRequestSpec,
    authChain,
    resolveEffectiveAuth,
    refreshSecrets,
  };
});

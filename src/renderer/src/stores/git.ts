import type { GitFileChange, GitFileStatus, GitStatus } from "@shared";

import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

const REFRESH_DEBOUNCE_MS = 250;

/** Letra do badge na árvore — `U` = untracked, como no VS Code. */
export const GIT_STATUS_LETTER: Record<GitFileStatus, string> = {
  modified: "M",
  added: "A",
  untracked: "U",
  deleted: "D",
  conflicted: "C",
};

/**
 * Nó da árvore dono de um arquivo mudado: a própria request, ou a pasta cujo `folder.yaml`
 * mudou. Environments, `wttp.yaml` e afins não são nós da árvore — `null`.
 */
export function nodePathForFile(path: string): string | null {
  if (path.endsWith(".req.yaml")) return path;
  if (path === "folder.yaml") return null;
  if (path.endsWith("/folder.yaml")) return path.slice(0, -"/folder.yaml".length);
  return null;
}

/** Todas as pastas acima de `path` (`a/b/c.req.yaml` → `a`, `a/b`). */
function ancestorsOf(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

/**
 * Estado Git do workspace aberto (ClickLocal #51): branch e mudanças desde o último commit,
 * vindos da CLI `git` do sistema (`git:status`). Sem `git` ou fora de um repositório, tudo
 * fica vazio e a UI esconde o que não se aplica — nunca um erro na cara do usuário.
 *
 * Atualiza ao abrir o workspace, a cada rescan da árvore (o que o app salva e o que o
 * watcher vê mudar por fora) e ao focar a janela (um `git commit`/`checkout` no terminal).
 */
export const useGitStore = defineStore("git", () => {
  const workspace = useWorkspaceStore();

  const status = ref<GitStatus | null>(null);
  const onlyChanged = ref(false);

  const available = computed(() => status.value?.available ?? false);
  const repository = computed(() => status.value?.repository ?? null);
  const files = computed<GitFileChange[]>(() => status.value?.files ?? []);

  /** Status por nó da árvore — só os nós que mudaram eles mesmos. */
  const nodeStatus = computed(() => {
    const map = new Map<string, GitFileStatus>();
    for (const file of files.value) {
      const node = nodePathForFile(file.path);
      if (node) map.set(node, file.status);
    }
    return map;
  });

  /** Pastas com alguma mudança dentro (inclusive um arquivo apagado, que não é mais nó). */
  const foldersWithChanges = computed(() => {
    const set = new Set<string>();
    for (const file of files.value) for (const folder of ancestorsOf(file.path)) set.add(folder);
    return set;
  });

  /** Paths que o filtro "Only changed" mantém visíveis — os nós mudados e as pastas acima deles. */
  const changedTreePaths = computed(() => {
    const set = new Set<string>(foldersWithChanges.value);
    for (const node of nodeStatus.value.keys()) set.add(node);
    return set;
  });

  let inFlight: Promise<void> | null = null;
  let again = false;

  async function refresh(): Promise<void> {
    const root = workspace.ready ? workspace.root : null;
    if (!root) {
      status.value = null;
      return;
    }
    if (inFlight) {
      again = true;
      return inFlight;
    }
    inFlight = (async () => {
      try {
        const next = await window.wttp.git.status({ root });
        // Workspace trocado enquanto o `git status` rodava — o resultado é de outro lugar.
        if (workspace.root === root) status.value = next;
      } catch (error) {
        console.error("wttp: git status failed", error);
      } finally {
        inFlight = null;
        if (again) {
          again = false;
          void refresh();
        }
      }
    })();
    return inFlight;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  function scheduleRefresh(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  watch(
    () => workspace.root,
    () => {
      status.value = null;
      onlyChanged.value = false;
      void refresh();
    },
    { immediate: true },
  );
  // Nova referência a cada rescan — depois de um save do app ou de uma mudança externa.
  watch(() => workspace.tree, scheduleRefresh);

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("focus", scheduleRefresh);
  }

  return {
    status,
    available,
    repository,
    files,
    nodeStatus,
    foldersWithChanges,
    changedTreePaths,
    onlyChanged,
    refresh,
  };
});

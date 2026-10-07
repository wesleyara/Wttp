import type { AuthConfig, FolderNode, HistoryEntry, WorkspaceNode } from "@shared";

import { i18n } from "@renderer/i18n";
import { inlineAttachment } from "@renderer/lib/docs/attachmentData";
import { renderDocsHtml } from "@renderer/lib/docs/exportHtml";
import { renderDocsMarkdown } from "@renderer/lib/docs/exportMarkdown";
import { buildDocsModel, type DocsFolder, flattenDocs } from "@renderer/lib/docs/model";
import { attachmentPathsIn } from "@renderer/lib/markdownAttachments";
import { isDocsTab, useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useToastStore } from "@renderer/stores/toast";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

export type DocsExportFormat = "html" | "markdown";

/** A pasta em `path` e o `auth` das pastas acima dela (a mais próxima primeiro) — o que o modelo precisa para resolver a herança. */
function findFolder(
  nodes: WorkspaceNode[],
  path: string,
  ancestorAuth: (AuthConfig | undefined)[] = [],
): { folder: FolderNode; ancestorAuth: (AuthConfig | undefined)[] } | null {
  for (const node of nodes) {
    if (node.kind !== "folder") continue;
    if (node.path === path) return { folder: node, ancestorAuth };
    if (path.startsWith(`${node.path}/`)) {
      const found = findFolder(node.children, path, [node.data?.auth, ...ancestorAuth]);
      if (found) return found;
    }
  }
  return null;
}

function fileSlug(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "docs"
  );
}

/**
 * Painel de leitura da documentação (EP-12-T02) e export estático (EP-12-T03). O modelo é
 * derivado da árvore já carregada do workspace — nenhum I/O para ler `docs`/assinaturas —
 * e só a "última execução" de cada request vem do histórico em disco. O estado vive aqui,
 * não nas abas de trabalho, então navegar pela documentação nunca as toca.
 */
export const useDocsReaderStore = defineStore("docsReader", () => {
  const workspace = useWorkspaceStore();
  const tabs = useRequestTabsStore();
  const toast = useToastStore();

  /** Alvo da aba de docs ativa (uma aba por collection/pasta); `null` quando a aba ativa não é de docs. */
  const targetPath = computed<string | null>(() =>
    isDocsTab(tabs.active) ? tabs.active.path : null,
  );
  /** Última execução por `path` de request, por alvo; `null` = nunca executada. */
  const lastRunsByTarget = ref<Record<string, Record<string, HistoryEntry | null>>>({});
  const exporting = ref(false);

  const lastRuns = computed(() =>
    targetPath.value === null ? {} : (lastRunsByTarget.value[targetPath.value] ?? {}),
  );

  function buildModel(path: string): DocsFolder | null {
    if (!workspace.tree) return null;
    const found = findFolder(workspace.tree.children, path);
    return found ? buildDocsModel(found.folder, found.ancestorAuth) : null;
  }

  const model = computed<DocsFolder | null>(() =>
    targetPath.value === null ? null : buildModel(targetPath.value),
  );

  async function loadLastRuns(path: string | null = targetPath.value): Promise<void> {
    const root = workspace.root;
    const current = path === null ? null : buildModel(path);
    if (!root || !current || path === null) return;
    const paths = flattenDocs(current)
      .filter(entry => entry.item.kind === "request")
      .map(entry => entry.item.path);
    const entries = await Promise.all(
      paths.map(async requestPath => {
        try {
          const history = await window.wttp.history.list({ root, path: requestPath });
          return [requestPath, history[0] ?? null] as const;
        } catch {
          return [requestPath, null] as const;
        }
      }),
    );
    // Troca de workspace durante o IPC: descarta em vez de sobrescrever.
    if (workspace.root !== root) return;
    lastRunsByTarget.value = { ...lastRunsByTarget.value, [path]: Object.fromEntries(entries) };
  }

  async function open(path: string): Promise<void> {
    const name = buildModel(path)?.name ?? path;
    tabs.openDocsTab(path, name);
    await loadLastRuns(path);
  }

  /** Anexos citados nos `docs` do modelo, já lidos do disco e embutidos (`data:`) para o HTML exportado. */
  async function loadInlineAttachments(current: DocsFolder): Promise<Map<string, string | null>> {
    const root = workspace.root;
    const inlined = new Map<string, string | null>();
    if (!root) return inlined;
    const paths = new Set(flattenDocs(current).flatMap(({ item }) => attachmentPathsIn(item.docs)));
    await Promise.all(
      [...paths].map(async path => {
        try {
          const { data, mime } = await window.wttp.attachment.read({ root, path });
          inlined.set(path, inlineAttachment(path, mime, data));
        } catch {
          inlined.set(path, null);
        }
      }),
    );
    return inlined;
  }

  async function exportAs(format: DocsExportFormat): Promise<void> {
    const current = model.value;
    if (!current || exporting.value) return;
    const { t } = i18n.global;
    exporting.value = true;
    try {
      const inlined = format === "html" ? await loadInlineAttachments(current) : new Map();
      const text =
        format === "html"
          ? renderDocsHtml(current, path => inlined.get(path) ?? null)
          : renderDocsMarkdown(current);
      const result = await window.wttp.dialog.saveFile({
        data: new TextEncoder().encode(text),
        suggestedName: `${fileSlug(current.name)}.${format === "html" ? "html" : "md"}`,
      });
      if (!result.canceled)
        toast.push(t("docsReader.exported", { path: result.path ?? "" }), "success");
    } catch {
      toast.push(t("docsReader.exportFailed"), "error");
    } finally {
      exporting.value = false;
    }
  }

  // Fechar a aba encerra a leitura daquele alvo; workspace trocado invalida tudo.
  watch(
    () => tabs.tabs.filter(isDocsTab).map(tab => tab.path),
    paths => {
      const open = new Set(paths);
      const kept = Object.entries(lastRunsByTarget.value).filter(([path]) => open.has(path));
      if (kept.length !== Object.keys(lastRunsByTarget.value).length)
        lastRunsByTarget.value = Object.fromEntries(kept);
    },
  );
  // Aba de docs ativada sem ter passado por `open` (ex.: outra aba fechada): carrega o que falta.
  watch(targetPath, path => {
    if (path !== null && !(path in lastRunsByTarget.value)) void loadLastRuns(path);
  });
  watch(
    () => workspace.root,
    () => {
      lastRunsByTarget.value = {};
    },
  );

  return { targetPath, model, lastRuns, exporting, open, loadLastRuns, exportAs };
});

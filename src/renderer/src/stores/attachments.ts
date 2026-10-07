import type { AttachmentInfo, WttpError } from "@shared";

import { i18n } from "@renderer/i18n";
import { formatBytes } from "@renderer/lib/format";
import { docsInTree, findUnusedAttachments } from "@renderer/lib/unusedAttachments";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useToastStore } from "@renderer/stores/toast";
import { useWorkspaceStore } from "@renderer/stores/workspace";
import { defineStore } from "pinia";
import { ref, watch } from "vue";

/** Texto de markdown que referencia um anexo — a extensão decide, na prévia, entre imagem e vídeo. */
export function attachmentMarkdown(info: AttachmentInfo, label = ""): string {
  const alt = label.replace(/[[\]\n]/g, " ").trim();
  return `![${alt}](${info.path})`;
}

function errorMessage(error: unknown): string {
  const { t } = i18n.global;
  const code = (error as WttpError | undefined)?.code;
  switch (code) {
    case "ATTACHMENT_TYPE":
      return t("attachments.unsupportedType");
    case "ATTACHMENT_TOO_LARGE":
      return t("attachments.tooLarge");
    case "ATTACHMENT_EMPTY":
      return t("attachments.empty");
    default:
      return t("attachments.failed");
  }
}

/**
 * Anexos de documentação (EP-12): imagens e vídeos copiados para `attachments/` do
 * workspace aberto (arch-docs/file-format.md §9), versionados junto com os YAMLs. O renderer
 * só pede — tipo, limite de tamanho e caminho são validados no main.
 */
export const useAttachmentsStore = defineStore("attachments", () => {
  const workspace = useWorkspaceStore();
  const toast = useToastStore();
  const tabs = useRequestTabsStore();

  /** Bytes colados/arrastados no editor. Arquivo recusado vira toast e fica de fora do resultado. */
  async function saveFiles(files: File[]): Promise<AttachmentInfo[]> {
    const root = workspace.root;
    if (!root) return [];
    const saved: AttachmentInfo[] = [];
    for (const file of files) {
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        saved.push(
          await window.wttp.attachment.save({ root, name: file.name || "pasted.png", data }),
        );
      } catch (error) {
        toast.push(`${file.name}: ${errorMessage(error)}`, "error");
      }
    }
    return saved;
  }

  /** Diálogo nativo (multi-seleção) que já copia para `attachments/`. */
  async function pick(): Promise<AttachmentInfo[]> {
    const root = workspace.root;
    if (!root) return [];
    try {
      const result = await window.wttp.attachment.pick({ root });
      return result.canceled ? [] : result.files;
    } catch (error) {
      toast.push(errorMessage(error), "error");
      return [];
    }
  }

  // ---- limpeza de anexos não usados ----

  const cleanupOpen = ref(false);
  const scanning = ref(false);
  const trashing = ref(false);
  const unused = ref<AttachmentInfo[]>([]);
  const selected = ref<Set<string>>(new Set());

  /** Textos que contam como uso: o `docs` salvo de todo o workspace e o das abas abertas (um `docs` ainda não salvo também protege o anexo). */
  function allDocs(): string[] {
    const texts = workspace.tree ? docsInTree(workspace.tree.children) : [];
    for (const tab of tabs.tabs) {
      if ((tab.kind === "request" || tab.kind === "folder") && tab.docs) texts.push(tab.docs);
    }
    return texts;
  }

  async function scan(): Promise<AttachmentInfo[]> {
    const root = workspace.root;
    if (!root) return [];
    return findUnusedAttachments(await window.wttp.attachment.list({ root }), allDocs());
  }

  async function openCleanup(): Promise<void> {
    cleanupOpen.value = true;
    scanning.value = true;
    unused.value = [];
    selected.value = new Set();
    try {
      unused.value = await scan();
      selected.value = new Set(unused.value.map(info => info.path));
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      scanning.value = false;
    }
  }

  function closeCleanup(): void {
    cleanupOpen.value = false;
  }

  function toggle(path: string): void {
    const next = new Set(selected.value);
    if (!next.delete(path)) next.add(path);
    selected.value = next;
  }

  function setAllSelected(all: boolean): void {
    selected.value = all ? new Set(unused.value.map(info => info.path)) : new Set();
  }

  /** Lixeira do SO; sem lixeira o main apaga de vez e diz quais — o aviso não promete "recuperável" sem ser. */
  async function trashSelected(): Promise<void> {
    const root = workspace.root;
    const paths = [...selected.value];
    if (!root || paths.length === 0 || trashing.value) return;
    const { t } = i18n.global;
    trashing.value = true;
    try {
      const result = await window.wttp.attachment.trash({ root, paths });
      if (result.trashed.length > 0) {
        toast.push(
          t("attachments.cleanup.moved", { count: result.trashed.length }, result.trashed.length),
          "success",
        );
      }
      if (result.deleted.length > 0) {
        toast.push(
          t("attachments.cleanup.deleted", { count: result.deleted.length }, result.deleted.length),
          "warning",
        );
      }
      if (result.failed.length > 0) {
        toast.push(
          t("attachments.cleanup.failed", { count: result.failed.length }, result.failed.length),
          "error",
        );
      }
      const gone = new Set([...result.trashed, ...result.deleted]);
      unused.value = unused.value.filter(info => !gone.has(info.path));
      selected.value = new Set([...selected.value].filter(path => !gone.has(path)));
      baseline = new Set(unused.value.map(info => info.path));
    } catch (error) {
      toast.push(errorMessage(error), "error");
    } finally {
      trashing.value = false;
    }
  }

  // ---- aviso ao salvar ----
  // Órfãos que já existiam ao abrir o workspace ficam em silêncio (`baseline`); só um anexo
  // que *passou a* ficar sem uso depois — tipicamente porque a referência saiu de um `docs`
  // salvo — gera um toast com o atalho para a limpeza. Nunca apaga nada sozinho.
  let baseline: Set<string> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function checkNewOrphans(): Promise<void> {
    if (!workspace.root) return;
    let now: AttachmentInfo[];
    try {
      now = await scan();
    } catch {
      return;
    }
    const known = baseline;
    baseline = new Set(now.map(info => info.path));
    if (known === null) return;
    const fresh = now.filter(info => !known.has(info.path));
    if (fresh.length === 0) return;

    const { t } = i18n.global;
    const bytes = formatBytes(fresh.reduce((sum, info) => sum + info.bytes, 0));
    toast.push(
      t("attachments.cleanup.notice", { count: fresh.length, size: bytes }, fresh.length),
      "info",
      8000,
      {
        label: t("attachments.cleanup.review"),
        onClick: () => void openCleanup(),
      },
    );
  }

  watch(
    () => workspace.tree,
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => void checkNewOrphans(), 800);
    },
  );
  watch(
    () => workspace.root,
    () => {
      baseline = null;
      cleanupOpen.value = false;
    },
  );

  return {
    saveFiles,
    pick,
    cleanupOpen,
    scanning,
    trashing,
    unused,
    selected,
    openCleanup,
    closeCleanup,
    toggle,
    setAllSelected,
    trashSelected,
  };
});

import type { ImportFormat, ImportPreview, ImportReport, WttpError } from "@shared";

import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { useWorkspaceStore } from "./workspace";

export type ImportStep = "source" | "preview" | "report";

const FORMAT_OPTIONS: { value: ImportFormat; label: string }[] = [
  { value: "postman", label: "Postman Collection" },
  { value: "insomnia", label: "Insomnia v4" },
  { value: "openapi", label: "OpenAPI 3.x" },
  { value: "curl", label: "cURL" },
];

/**
 * Fluxo do modal de import (EP-08-T06). Decisão de escopo: o único ponto de entrada
 * hoje é o botão "Import" da `WorkspaceLanding` (sem workspace aberto ainda) — por
 * isso o destino é sempre um workspace **novo** (mesmo `workspace:create` que o botão
 * "Create workspace" já usa), nunca uma pasta dentro de uma árvore existente. Import
 * para dentro de um workspace já aberto — com conflito de nome por item (renomear/
 * substituir/pular) — fica para uma task própria (EP-08-T07): não faz sentido nesta
 * tela, e um workspace recém-criado nunca tem nó pra colidir.
 *
 * `preview()` só faz `parse`+`normalize` (via `import:preview`) — nada é gravado até
 * `confirm()`, que cria o workspace e só então roda `import:run`.
 */
export const useImportStore = defineStore("import", () => {
  const step = ref<ImportStep>("source");
  const content = ref("");
  const sourcePath = ref<string | null>(null);
  const format = ref<ImportFormat | null>(null);
  const preview = ref<ImportPreview | null>(null);
  const workspaceName = ref("");
  const workspaceDir = ref<string | null>(null);
  const report = ref<ImportReport | null>(null);
  const loading = ref(false);
  const error = ref<WttpError | null>(null);

  const formatOptions = computed(() => FORMAT_OPTIONS);
  const canPreview = computed(() => content.value.trim().length > 0 && format.value !== null);
  const canConfirm = computed(
    () => workspaceName.value.trim().length > 0 && preview.value !== null,
  );

  /** Relatório legível (EP-08-T06, critério "relatório exportável") — copiável ou salvável como está. */
  const reportText = computed(() => {
    if (!report.value) return "";
    const lines = [
      `Import report — ${workspaceName.value || "workspace"}`,
      `Folders created: ${report.value.createdFolders}`,
      `Requests created: ${report.value.createdRequests}`,
      `Environments created: ${report.value.createdEnvironments}`,
      "",
    ];
    if (report.value.notConverted.length === 0) {
      lines.push("Everything converted — nothing needs manual attention.");
    } else {
      lines.push(`${report.value.notConverted.length} item(s) need manual attention:`, "");
      for (const item of report.value.notConverted) lines.push(`- ${item.path}: ${item.reason}`);
    }
    return lines.join("\n");
  });

  function reset(): void {
    step.value = "source";
    content.value = "";
    sourcePath.value = null;
    format.value = null;
    preview.value = null;
    workspaceName.value = "";
    workspaceDir.value = null;
    report.value = null;
    error.value = null;
  }

  async function detectFormat(): Promise<void> {
    if (!content.value.trim()) {
      format.value = null;
      return;
    }
    format.value = await window.wttp.import.detect({
      content: content.value,
      filename: sourcePath.value ?? undefined,
    });
  }

  async function setContent(text: string): Promise<void> {
    content.value = text;
    sourcePath.value = null;
    await detectFormat();
  }

  async function loadFromFile(): Promise<void> {
    error.value = null;
    const result = await window.wttp.dialog.pickFile({ extensions: ["json", "yaml", "yml"] });
    if (result.canceled || result.content === undefined) return;
    content.value = result.content;
    sourcePath.value = result.path ?? null;
    await detectFormat();
  }

  function setFormat(next: ImportFormat): void {
    format.value = next;
  }

  async function pickWorkspaceDir(defaultPath?: string): Promise<void> {
    const result = await window.wttp.dialog.pickFolder({ defaultPath });
    if (!result.canceled && result.path) workspaceDir.value = result.path;
  }

  async function loadPreview(): Promise<void> {
    if (!format.value) return;
    loading.value = true;
    error.value = null;
    try {
      preview.value = await window.wttp.import.preview({
        format: format.value,
        content: content.value,
      });
      workspaceName.value = preview.value.name;
      step.value = "preview";
    } catch (e) {
      error.value = e as WttpError;
    } finally {
      loading.value = false;
    }
  }

  /** Cria o workspace novo e só então grava a árvore importada nele. */
  async function confirm(): Promise<void> {
    if (!format.value || !workspaceDir.value || !workspaceName.value.trim()) return;
    loading.value = true;
    error.value = null;
    const workspaceStore = useWorkspaceStore();
    try {
      const path = `${workspaceDir.value}/${workspaceName.value.trim()}`;
      await workspaceStore.create(path, workspaceName.value.trim());
      if (workspaceStore.error) {
        error.value = workspaceStore.error;
        return;
      }

      report.value = await window.wttp.import.run({
        format: format.value,
        content: content.value,
        root: path,
        targetPath: "",
      });
      await workspaceStore.refreshTree();
      step.value = "report";
    } catch (e) {
      error.value = e as WttpError;
    } finally {
      loading.value = false;
    }
  }

  async function saveReportToFile(): Promise<void> {
    if (!report.value) return;
    const data = new TextEncoder().encode(reportText.value);
    await window.wttp.dialog.saveFile({
      data,
      suggestedName: `${workspaceName.value || "import"}-report.txt`,
    });
  }

  return {
    step,
    content,
    sourcePath,
    format,
    preview,
    workspaceName,
    workspaceDir,
    report,
    loading,
    error,
    formatOptions,
    canPreview,
    canConfirm,
    reportText,
    reset,
    setContent,
    loadFromFile,
    setFormat,
    pickWorkspaceDir,
    loadPreview,
    confirm,
    saveReportToFile,
  };
});

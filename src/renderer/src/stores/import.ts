import type { ImportFormat, ImportPreview, ImportReport, WttpError } from "@shared";

import { i18n } from "@renderer/i18n";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { useWorkspaceStore } from "./workspace";

export type ImportStep = "source" | "preview" | "report";

/** Para dentro de um workspace novo (EP-08-T06) ou na raiz de um já aberto (EP-08-T07). */
export type ImportMode = "newWorkspace" | "intoWorkspace";

const FORMAT_OPTIONS: { value: ImportFormat; label: string }[] = [
  { value: "postman", label: "Postman Collection" },
  { value: "insomnia", label: "Insomnia v4" },
  { value: "openapi", label: "OpenAPI 3.x" },
  { value: "curl", label: "cURL" },
];

/**
 * Fluxo do modal de import. Dois modos:
 *
 * - `newWorkspace` (EP-08-T06): sem workspace aberto ainda — cria um novo (mesmo
 *   `workspace:create` do botão "Create workspace"). Ponto de entrada: botão "Import"
 *   da `WorkspaceLanding`.
 * - `intoWorkspace` (EP-08-T07): workspace já aberto — grava direto na raiz dele, o
 *   mesmo `targetPath: ""` que "New collection" usa. A raiz de um workspace só pode
 *   conter collections e uma collection nunca fica dentro de outra (`WTree`), então
 *   isso é sempre uma pasta nova (nome da collection de origem) — nenhum nó existente
 *   pode colidir, o mesmo motivo pelo qual "New collection" clicado duas vezes nunca
 *   precisa perguntar nada ao usuário. Ponto de entrada: item "Import" no menu "+" da
 *   toolbar da árvore (`AppShell`), nunca por pasta — importar "dentro" de uma pasta
 *   específica romperia essa regra.
 *
 * `loadPreview()` só faz `parse`+`normalize` (via `import:preview`) — nada é gravado
 * até `confirm()`.
 */
export const useImportStore = defineStore("import", () => {
  const mode = ref<ImportMode>("newWorkspace");
  const step = ref<ImportStep>("source");
  const content = ref("");
  const sourcePath = ref<string | null>(null);
  const format = ref<ImportFormat | null>(null);
  const preview = ref<ImportPreview | null>(null);
  const report = ref<ImportReport | null>(null);
  const loading = ref(false);
  const error = ref<WttpError | null>(null);

  // Modo "newWorkspace"
  const workspaceName = ref("");
  const workspaceDir = ref<string | null>(null);

  // Modo "intoWorkspace"
  const intoRoot = ref<string | null>(null);

  const formatOptions = computed(() => FORMAT_OPTIONS);
  const canPreview = computed(() => content.value.trim().length > 0 && format.value !== null);
  const canConfirm = computed(() => {
    if (!preview.value) return false;
    if (mode.value === "intoWorkspace") return true;
    return workspaceName.value.trim().length > 0;
  });

  const reportTitle = computed(
    () => workspaceName.value || preview.value?.name || i18n.global.t("importReport.fallbackName"),
  );

  /** Relatório legível (EP-08-T06, critério "relatório exportável") — copiável ou salvável como está. */
  const reportText = computed(() => {
    if (!report.value) return "";
    const lines = [
      i18n.global.t("importReport.title", { name: reportTitle.value }),
      i18n.global.t("importReport.foldersCreated", { count: report.value.createdFolders }),
      i18n.global.t("importReport.requestsCreated", { count: report.value.createdRequests }),
      i18n.global.t("importReport.environmentsCreated", {
        count: report.value.createdEnvironments,
      }),
      "",
    ];
    if (report.value.notConverted.length === 0) {
      lines.push(i18n.global.t("importReport.allConverted"));
    } else {
      lines.push(
        i18n.global.t("importReport.needAttention", { count: report.value.notConverted.length }),
        "",
      );
      for (const item of report.value.notConverted) lines.push(`- ${item.path}: ${item.reason}`);
    }
    return lines.join("\n");
  });

  function resetCore(): void {
    step.value = "source";
    content.value = "";
    sourcePath.value = null;
    format.value = null;
    preview.value = null;
    report.value = null;
    error.value = null;
  }

  /** Abre o modal no modo "workspace novo" (EP-08-T06) — botão "Import" da `WorkspaceLanding`. */
  function startNewWorkspace(): void {
    resetCore();
    mode.value = "newWorkspace";
    workspaceName.value = "";
    workspaceDir.value = null;
  }

  /** Abre o modal no modo "na raiz do workspace aberto" (EP-08-T07) — item "Import" do menu "+" da toolbar. */
  function startIntoWorkspace(root: string): void {
    resetCore();
    mode.value = "intoWorkspace";
    intoRoot.value = root;
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

  async function loadPreview(): Promise<void> {
    if (!format.value) return;
    loading.value = true;
    error.value = null;
    try {
      preview.value = await window.wttp.import.preview({
        format: format.value,
        content: content.value,
      });
      if (mode.value === "newWorkspace") workspaceName.value = preview.value.name;
      step.value = "preview";
    } catch (e) {
      error.value = e as WttpError;
    } finally {
      loading.value = false;
    }
  }

  /** Cria o workspace novo e só então grava a árvore importada nele (EP-08-T06). */
  async function confirmNewWorkspace(): Promise<void> {
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

  /** Grava na raiz do workspace já aberto — mesmo `targetPath: ""` de "New collection" (EP-08-T07). */
  async function confirmIntoWorkspace(): Promise<void> {
    if (!format.value || !intoRoot.value) return;
    loading.value = true;
    error.value = null;
    try {
      report.value = await window.wttp.import.run({
        format: format.value,
        content: content.value,
        root: intoRoot.value,
        targetPath: "",
      });
      await useWorkspaceStore().refreshTree();
      step.value = "report";
    } catch (e) {
      error.value = e as WttpError;
    } finally {
      loading.value = false;
    }
  }

  async function confirm(): Promise<void> {
    if (mode.value === "intoWorkspace") await confirmIntoWorkspace();
    else await confirmNewWorkspace();
  }

  async function saveReportToFile(): Promise<void> {
    if (!report.value) return;
    const data = new TextEncoder().encode(reportText.value);
    await window.wttp.dialog.saveFile({
      data,
      suggestedName: `${reportTitle.value || "import"}-report.txt`,
    });
  }

  return {
    mode,
    step,
    content,
    sourcePath,
    format,
    preview,
    report,
    loading,
    error,
    workspaceName,
    workspaceDir,
    formatOptions,
    canPreview,
    canConfirm,
    reportText,
    startNewWorkspace,
    startIntoWorkspace,
    setContent,
    loadFromFile,
    setFormat,
    loadPreview,
    confirm,
    saveReportToFile,
  };
});

import type {
  ImportConflictAction,
  ImportConflictResolution,
  ImportFormat,
  ImportPreview,
  ImportReport,
  WttpError,
} from "@shared";

import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { useWorkspaceStore } from "./workspace";

export type ImportStep = "source" | "preview" | "report";

/** Para dentro de um workspace novo (EP-08-T06) ou de uma pasta já aberta (EP-08-T07). */
export type ImportMode = "newWorkspace" | "intoFolder";

interface ConflictResolutionState {
  action: ImportConflictAction;
  newName: string;
}

const FORMAT_OPTIONS: { value: ImportFormat; label: string }[] = [
  { value: "postman", label: "Postman Collection" },
  { value: "insomnia", label: "Insomnia v4" },
  { value: "openapi", label: "OpenAPI 3.x" },
  { value: "curl", label: "cURL" },
];

/**
 * Fluxo do modal de import. Dois modos:
 *
 * - `newWorkspace` (EP-08-T06): destino é sempre um workspace **novo** — sem nó pra
 *   colidir, sem conflito possível. Ponto de entrada: botão "Import" da
 *   `WorkspaceLanding`.
 * - `intoFolder` (EP-08-T07): destino é uma pasta já existente num workspace aberto —
 *   `ImportPreview.children` é gravado direto nela (sem a pasta-raiz que o modo
 *   `newWorkspace` sempre cria), e cada nó cujo nome já existe no destino precisa de
 *   uma resolução (renomear/substituir/pular), nunca uma escolha global. Ponto de
 *   entrada: "Import into this folder" no menu de contexto de uma pasta/collection.
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

  // Modo "intoFolder"
  const intoRoot = ref<string | null>(null);
  const intoParentPath = ref<string | null>(null);
  const intoParentName = ref("");
  /** Só os índices de `preview.children` que colidem com um nome já existente no destino. */
  const resolutions = ref<Map<number, ConflictResolutionState>>(new Map());
  const conflictsLoaded = ref(false);

  const formatOptions = computed(() => FORMAT_OPTIONS);
  const canPreview = computed(() => content.value.trim().length > 0 && format.value !== null);

  const hasInvalidResolution = computed(() =>
    [...resolutions.value.values()].some(
      resolution => resolution.action === "rename" && !resolution.newName.trim(),
    ),
  );

  const canConfirm = computed(() => {
    if (!preview.value) return false;
    if (mode.value === "intoFolder") {
      return conflictsLoaded.value && !hasInvalidResolution.value;
    }
    return workspaceName.value.trim().length > 0;
  });

  const conflictEntries = computed(() =>
    preview.value
      ? [...resolutions.value.keys()]
          .sort((a, b) => a - b)
          .map(index => ({ index, node: preview.value!.children[index] }))
      : [],
  );

  const reportTitle = computed(() =>
    mode.value === "intoFolder"
      ? intoParentName.value || "folder"
      : workspaceName.value || "workspace",
  );

  /** Relatório legível (EP-08-T06, critério "relatório exportável") — copiável ou salvável como está. */
  const reportText = computed(() => {
    if (!report.value) return "";
    const lines = [
      `Import report — ${reportTitle.value}`,
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

  function resetCore(): void {
    step.value = "source";
    content.value = "";
    sourcePath.value = null;
    format.value = null;
    preview.value = null;
    report.value = null;
    error.value = null;
    resolutions.value = new Map();
    conflictsLoaded.value = false;
  }

  /** Abre o modal no modo "workspace novo" (EP-08-T06) — botão "Import" da `WorkspaceLanding`. */
  function startNewWorkspace(): void {
    resetCore();
    mode.value = "newWorkspace";
    workspaceName.value = "";
    workspaceDir.value = null;
  }

  /** Abre o modal no modo "para dentro desta pasta" (EP-08-T07) — menu de contexto de uma pasta/collection. */
  function startIntoFolder(root: string, parentPath: string, parentName: string): void {
    resetCore();
    mode.value = "intoFolder";
    intoRoot.value = root;
    intoParentPath.value = parentPath;
    intoParentName.value = parentName;
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

  /** Compara `preview.children` com os filhos atuais de `intoParentPath` — só o nível único onde conflito é possível (sem merge, ver comentário do módulo). */
  async function loadConflicts(): Promise<void> {
    if (!intoRoot.value || intoParentPath.value === null || !preview.value) return;
    const destination = await window.wttp.node.read({
      root: intoRoot.value,
      path: intoParentPath.value,
    });
    const existingNames = new Set(
      destination.kind === "folder" ? destination.children.map(child => child.name) : [],
    );

    const next = new Map<number, ConflictResolutionState>();
    preview.value.children.forEach((node, index) => {
      if (existingNames.has(node.name)) {
        next.set(index, { action: "rename", newName: `${node.name} copy` });
      }
    });
    resolutions.value = next;
    conflictsLoaded.value = true;
  }

  function setResolutionAction(index: number, action: ImportConflictAction): void {
    const current = resolutions.value.get(index);
    if (!current) return;
    const next = new Map(resolutions.value);
    next.set(index, { ...current, action });
    resolutions.value = next;
  }

  function setResolutionName(index: number, newName: string): void {
    const current = resolutions.value.get(index);
    if (!current) return;
    const next = new Map(resolutions.value);
    next.set(index, { ...current, newName });
    resolutions.value = next;
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
      if (mode.value === "newWorkspace") {
        workspaceName.value = preview.value.name;
      } else {
        await loadConflicts();
      }
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

  /** Grava direto em `intoParentPath`, aplicando a resolução escolhida por item (EP-08-T07). */
  async function confirmIntoFolder(): Promise<void> {
    if (!format.value || !intoRoot.value || intoParentPath.value === null) return;
    loading.value = true;
    error.value = null;
    try {
      const resolutionsPayload: ImportConflictResolution[] = [...resolutions.value.entries()].map(
        ([index, resolution]) => ({
          index,
          action: resolution.action,
          newName: resolution.action === "rename" ? resolution.newName.trim() : undefined,
        }),
      );

      report.value = await window.wttp.import.run({
        format: format.value,
        content: content.value,
        root: intoRoot.value,
        targetPath: intoParentPath.value,
        resolutions: resolutionsPayload,
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
    if (mode.value === "intoFolder") await confirmIntoFolder();
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
    intoParentPath,
    intoParentName,
    resolutions,
    conflictEntries,
    conflictsLoaded,
    formatOptions,
    canPreview,
    canConfirm,
    reportText,
    startNewWorkspace,
    startIntoFolder,
    setContent,
    loadFromFile,
    setFormat,
    pickWorkspaceDir,
    loadPreview,
    setResolutionAction,
    setResolutionName,
    confirm,
    saveReportToFile,
  };
});

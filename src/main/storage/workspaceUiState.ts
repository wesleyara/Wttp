/**
 * Estado de UI por workspace — docs/file-format.md §1: `.wttp/ui-state.json`,
 * gitignored. Guarda o que é específico de *como* o usuário está navegando este
 * workspace nesta máquina (pastas expandidas na árvore, EP-05-T02; abas de request
 * abertas, EP-05-T05) — não confundir com `config/` (`ui-state.json` global do app,
 * tamanhos de painel, sobrevive entre workspaces). Mesmo padrão de arquivo local sob
 * `.wttp/` que `secrets/store.ts` já usa.
 */

import type { WorkspaceUiState } from "@shared";

import { promises as fs } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "./fsAtomic";

const LOCAL_DIR = ".wttp";
const FILE = "ui-state.json";

const EMPTY: WorkspaceUiState = { expandedPaths: [], openTabs: [], activeTabPath: null };

function uiStatePath(root: string): string {
  return join(root, LOCAL_DIR, FILE);
}

export async function readWorkspaceUiState(root: string): Promise<WorkspaceUiState> {
  try {
    const raw = await fs.readFile(uiStatePath(root), "utf-8");
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<WorkspaceUiState>) };
  } catch {
    return EMPTY;
  }
}

export async function writeWorkspaceUiState(root: string, state: WorkspaceUiState): Promise<void> {
  await writeFileAtomic(uiStatePath(root), JSON.stringify(state, null, 2));
}

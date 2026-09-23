/**
 * Rascunhos de abas sujas por workspace — arch-docs/file-format.md §1: `.wttp/drafts.json`,
 * gitignored. Espelha `workspaceUiState.ts`: mesmo `writeFileAtomic`, mesmo `try/catch`
 * que devolve vazio quando o arquivo não existe ou está corrompido. Existe para
 * `useRequestTabsStore` sobreviver ao fechamento do app com uma aba suja (EP-08.1-T01) —
 * o que foi digitado e não salvo, não só quais abas estavam abertas.
 */

import type { WorkspaceDrafts } from "@shared";

import { promises as fs } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "./fsAtomic";

const LOCAL_DIR = ".wttp";
const FILE = "drafts.json";

const EMPTY: WorkspaceDrafts = {};

function draftsPath(root: string): string {
  return join(root, LOCAL_DIR, FILE);
}

export async function readWorkspaceDrafts(root: string): Promise<WorkspaceDrafts> {
  try {
    const raw = await fs.readFile(draftsPath(root), "utf-8");
    return { ...EMPTY, ...(JSON.parse(raw) as WorkspaceDrafts) };
  } catch {
    return EMPTY;
  }
}

export async function writeWorkspaceDrafts(root: string, drafts: WorkspaceDrafts): Promise<void> {
  await writeFileAtomic(draftsPath(root), JSON.stringify(drafts, null, 2));
}

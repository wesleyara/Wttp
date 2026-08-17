/**
 * Lista de workspaces recentes (`workspace:recent`) — não faz parte do workspace em
 * si, então vive em `appDataDir()` como `ui-state.json`/`settings.json` (EP-02), não em
 * `storage/`'s árvore de disco.
 */

import type { RecentWorkspace } from "@shared";

import { appDataDir } from "../config/appDataDir";
import { readJsonFile, writeJsonFile } from "../config/jsonFile";

const FILE = "recent-workspaces.json";
const MAX_ENTRIES = 10;

interface RecentWorkspacesData {
  entries: RecentWorkspace[];
}

const EMPTY: RecentWorkspacesData = { entries: [] };

export async function listRecentWorkspaces(): Promise<RecentWorkspace[]> {
  const data = await readJsonFile(appDataDir(), FILE, EMPTY);
  return data.entries;
}

/** Move `path` para o topo da lista (ou insere), com o timestamp de agora. */
export async function touchRecentWorkspace(path: string, name: string): Promise<void> {
  const data = await readJsonFile(appDataDir(), FILE, EMPTY);
  const entry: RecentWorkspace = { path, name, lastOpened: new Date().toISOString() };
  const withoutCurrent = data.entries.filter(existing => existing.path !== path);
  const entries = [entry, ...withoutCurrent].slice(0, MAX_ENTRIES);
  await writeJsonFile(appDataDir(), FILE, { entries });
}

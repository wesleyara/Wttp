/**
 * Lista de workspaces recentes (`workspace:recent`) — não faz parte do workspace em
 * si, então vive em `appDataDir()` como `ui-state.json`/`settings.json` (EP-02), não em
 * `storage/`'s árvore de disco.
 */

import type { RecentWorkspace } from "@shared";

import { promises as fs } from "node:fs";

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

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Como `listRecentWorkspaces`, mas marca `missing` em cada entrada cuja pasta não
 * existe mais — nunca remove a entrada sozinho, `workspace:removeRecent` é o único
 * jeito de tirá-la da lista (EP-05-T01: "sinalizada, não some silenciosamente").
 */
export async function listRecentWorkspacesWithStatus(): Promise<RecentWorkspace[]> {
  const entries = await listRecentWorkspaces();
  return Promise.all(
    entries.map(async entry => ({ ...entry, missing: !(await pathExists(entry.path)) })),
  );
}

/** Move `path` para o topo da lista (ou insere), com o timestamp de agora. */
export async function touchRecentWorkspace(path: string, name: string): Promise<void> {
  const data = await readJsonFile(appDataDir(), FILE, EMPTY);
  const entry: RecentWorkspace = { path, name, lastOpened: new Date().toISOString() };
  const withoutCurrent = data.entries.filter(existing => existing.path !== path);
  const entries = [entry, ...withoutCurrent].slice(0, MAX_ENTRIES);
  await writeJsonFile(appDataDir(), FILE, { entries });
}

/**
 * Remove `path` da lista de recentes — usado quando o usuário descarta manualmente
 * uma entrada que aponta para uma pasta removida (EP-05-T01, nunca some sozinha).
 */
export async function removeRecentWorkspace(path: string): Promise<RecentWorkspace[]> {
  const data = await readJsonFile(appDataDir(), FILE, EMPTY);
  const entries = data.entries.filter(existing => existing.path !== path);
  await writeJsonFile(appDataDir(), FILE, { entries });
  return listRecentWorkspacesWithStatus();
}

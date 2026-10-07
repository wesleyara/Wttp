/**
 * Flows em disco — `flows/*.flow.yaml`, arch-docs/file-format.md §10. Mesmas regras dos
 * environments: um arquivo por flow, nome derivado de `name`, escrita atômica e
 * determinística, e um flow inválido não derruba a lista.
 */

import type { FlowFile, FlowListItem } from "@shared";

import { FLOW_SCHEMA_VERSION } from "@shared/flow";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import { DomainError } from "../ipc/errors";
import { writeYamlAtomic } from "./eol";
import { serializeFlow } from "./serializer";
import { uniqueSlugName } from "./slug";
import { validateFlow } from "./validate";
import { clearKnownMtimesUnder, markOwnWrite } from "./writeTracker";

export const FLOWS_DIR = "flows";
export const FLOW_SUFFIX = ".flow.yaml";

function flowAbsPath(root: string, path: string): string {
  // `path` é só um nome de arquivo — nunca um caminho que saia de `flows/`.
  if (
    path.includes("/") ||
    path.includes("\\") ||
    path.includes("..") ||
    !path.endsWith(FLOW_SUFFIX)
  ) {
    throw new DomainError("INVALID_PAYLOAD", `invalid flow path: "${path}"`, path);
  }
  return join(root, FLOWS_DIR, path);
}

async function readFlowItem(root: string, path: string): Promise<FlowListItem | null> {
  const raw = await fs.readFile(flowAbsPath(root, path), "utf-8").catch(() => null);
  if (raw === null) return null;
  const result = validateFlow(raw);
  if (result.valid) return { path, name: result.value.name, data: result.value };
  return {
    path,
    name: path.slice(0, -FLOW_SUFFIX.length),
    data: null,
    issues: result.issues.map(issue => ({
      path: issue.path,
      message: issue.message,
      line: issue.line,
    })),
  };
}

/** Todos os flows do workspace, em ordem alfabética pelo nome — inválidos incluídos, com `issues`. */
export async function listFlows(root: string): Promise<FlowListItem[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(join(root, FLOWS_DIR));
  } catch {
    return [];
  }
  const items = await Promise.all(
    entries.filter(name => name.endsWith(FLOW_SUFFIX)).map(name => readFlowItem(root, name)),
  );
  return items
    .filter((item): item is FlowListItem => item !== null)
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }),
    );
}

export function getFlow(root: string, path: string): Promise<FlowListItem | null> {
  return readFlowItem(root, path);
}

export async function createFlow(root: string, name: string): Promise<FlowListItem> {
  const dir = join(root, FLOWS_DIR);
  await fs.mkdir(dir, { recursive: true });
  const existing = new Set(await fs.readdir(dir));
  const path = uniqueSlugName(name, FLOW_SUFFIX, candidate => existing.has(candidate));
  const data: FlowFile = { wttp: FLOW_SCHEMA_VERSION, name, nodes: [] };
  await writeYamlAtomic(flowAbsPath(root, path), serializeFlow(data));
  return { path, name, data };
}

export async function writeFlow(root: string, path: string, flow: FlowFile): Promise<FlowListItem> {
  const absPath = flowAbsPath(root, path);
  if (!(await fs.stat(absPath).catch(() => null))) {
    throw new DomainError("ENOENT", `flow not found: "${path}"`, path);
  }
  const text = serializeFlow({ ...flow, wttp: FLOW_SCHEMA_VERSION });
  // Nunca grava o que a própria leitura recusaria.
  const result = validateFlow(text);
  if (!result.valid) {
    throw new DomainError("SCHEMA_INVALID", result.issues[0]?.message ?? "invalid flow", path);
  }
  await writeYamlAtomic(absPath, text);
  return { path, name: flow.name, data: result.value };
}

/** Renomeia: `name` novo no YAML e arquivo novo derivado dele (regra 6). Devolve o item com o `path` novo. */
export async function renameFlow(root: string, path: string, name: string): Promise<FlowListItem> {
  const current = await readFlowItem(root, path);
  if (!current?.data) {
    throw new DomainError("INVALID_PAYLOAD", `cannot rename an invalid flow: "${path}"`, path);
  }
  const dir = join(root, FLOWS_DIR);
  const existing = new Set(await fs.readdir(dir));
  existing.delete(path);
  const newPath = uniqueSlugName(name, FLOW_SUFFIX, candidate => existing.has(candidate));
  const data: FlowFile = { ...current.data, name };
  await writeYamlAtomic(flowAbsPath(root, path), serializeFlow(data));
  if (newPath !== path) {
    const from = flowAbsPath(root, path);
    const to = flowAbsPath(root, newPath);
    markOwnWrite(from);
    markOwnWrite(to);
    await fs.rename(from, to);
    clearKnownMtimesUnder(from);
  }
  return { path: newPath, name, data };
}

export async function deleteFlow(root: string, path: string): Promise<void> {
  const absPath = flowAbsPath(root, path);
  markOwnWrite(absPath);
  await fs.rm(absPath, { force: true });
  clearKnownMtimesUnder(absPath);
}

/** `request` depois de `from` virar `to` — a própria request, ou qualquer coisa dentro de uma pasta movida. */
function rewritten(request: string, from: string, to: string): string {
  if (request === from) return to;
  if (request.startsWith(`${from}/`)) return `${to}${request.slice(from.length)}`;
  return request;
}

/**
 * Chamada quando uma request (ou a pasta que a contém) é renomeada ou movida: todo nó de
 * flow que apontava para o caminho antigo passa a apontar para o novo, para o flow não
 * quebrar em silêncio. Só reescreve o arquivo que de fato muda.
 */
export async function rewriteFlowReferences(root: string, from: string, to: string): Promise<void> {
  if (from === to) return;
  for (const item of await listFlows(root)) {
    const data = item.data;
    if (!data) continue;
    let changed = false;
    const nodes = data.nodes.map(node => {
      if (node.request === undefined) return node;
      const request = rewritten(node.request, from, to);
      if (request === node.request) return node;
      changed = true;
      return { ...node, request };
    });
    if (changed) {
      await writeYamlAtomic(flowAbsPath(root, item.path), serializeFlow({ ...data, nodes }));
    }
  }
}

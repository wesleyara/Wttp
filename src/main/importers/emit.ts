/**
 * Grava uma `NormalizedImport` no workspace — o único lugar do pipeline que toca
 * disco, e faz isso só através de `storage/tree.ts`/`storage/environments.ts`, os
 * mesmos caminhos que qualquer outra criação de nó no app usa (EP-08-T01).
 *
 * Sequencial de propósito: `createNode` calcula `seq` a partir dos irmãos já no disco
 * no momento da chamada, então duas criações concorrentes no mesmo pai colidiriam.
 */

import type { FolderFile, FolderNode, ImportReport, RequestFile, RequestNode } from "@shared";

import type { NormalizedImport, NormalizedNode } from "./types";

import { saveEnvironment } from "../storage/environments";
import { createNode, writeNode } from "../storage/tree";

interface EmitCounts {
  folders: number;
  requests: number;
  environments: number;
}

async function emitNode(
  root: string,
  parentPath: string,
  node: NormalizedNode,
  counts: EmitCounts,
): Promise<void> {
  if (node.kind === "folder") {
    const created = (await createNode(root, parentPath, "folder", node.name)) as FolderNode;
    counts.folders += 1;

    if (node.auth || node.docs) {
      const data: FolderFile = {
        ...(created.data as FolderFile),
        auth: node.auth,
        docs: node.docs,
      };
      await writeNode(root, created.path, { ...created, data });
    }

    for (const child of node.children) {
      await emitNode(root, created.path, child, counts);
    }
    return;
  }

  const created = (await createNode(root, parentPath, "request", node.name)) as RequestNode;
  counts.requests += 1;

  const data: RequestFile = {
    ...(created.data as RequestFile),
    method: node.method,
    url: node.url,
    pathParams: node.pathParams,
    query: node.query,
    headers: node.headers,
    auth: node.auth,
    body: node.body,
    docs: node.docs,
  };
  await writeNode(root, created.path, { ...created, data });
}

export async function emitImport(
  root: string,
  targetPath: string,
  normalized: NormalizedImport,
): Promise<ImportReport> {
  const counts: EmitCounts = { folders: 0, requests: 0, environments: 0 };

  const rootFolder = await createNode(root, targetPath, "folder", normalized.name);
  counts.folders += 1;

  for (const child of normalized.children) {
    await emitNode(root, rootFolder.path, child, counts);
  }

  for (const environment of normalized.environments) {
    await saveEnvironment({ root, name: environment.name, variables: environment.variables });
    counts.environments += 1;
  }

  return {
    createdFolders: counts.folders,
    createdRequests: counts.requests,
    createdEnvironments: counts.environments,
    notConverted: normalized.notConverted,
  };
}

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

import { osKeychainEncryption, type SecretEncryption } from "../secrets/encryption";
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

    if (node.auth || node.docs || node.variables || node.scripts) {
      const data: FolderFile = {
        ...(created.data as FolderFile),
        auth: node.auth,
        docs: node.docs,
        variables: node.variables,
        scripts: node.scripts,
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
    scripts: node.scripts,
    docs: node.docs,
  };
  await writeNode(root, created.path, { ...created, data });
}

export async function emitImport(
  root: string,
  targetPath: string,
  normalized: NormalizedImport,
  encryption: SecretEncryption = osKeychainEncryption,
): Promise<ImportReport> {
  const counts: EmitCounts = { folders: 0, requests: 0, environments: 0 };

  // Import só de environment (ex.: Postman Environment, EP-08-T02) não tem nada para
  // pendurar numa pasta raiz — criar uma vazia seria ruído na árvore do usuário.
  const hasRootContent =
    normalized.children.length > 0 ||
    Boolean(normalized.auth) ||
    Boolean(normalized.docs) ||
    Boolean(normalized.variables?.length) ||
    Boolean(normalized.scripts);

  if (hasRootContent) {
    const rootFolder = (await createNode(
      root,
      targetPath,
      "folder",
      normalized.name,
    )) as FolderNode;
    counts.folders += 1;

    if (normalized.auth || normalized.docs || normalized.variables || normalized.scripts) {
      const data: FolderFile = {
        ...(rootFolder.data as FolderFile),
        auth: normalized.auth,
        docs: normalized.docs,
        variables: normalized.variables,
        scripts: normalized.scripts,
      };
      await writeNode(root, rootFolder.path, { ...rootFolder, data });
    }

    for (const child of normalized.children) {
      await emitNode(root, rootFolder.path, child, counts);
    }
  }

  for (const environment of normalized.environments) {
    await saveEnvironment(
      { root, name: environment.name, variables: environment.variables },
      encryption,
    );
    counts.environments += 1;
  }

  return {
    createdFolders: counts.folders,
    createdRequests: counts.requests,
    createdEnvironments: counts.environments,
    notConverted: normalized.notConverted,
  };
}

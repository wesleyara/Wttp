/**
 * Grava uma `NormalizedImport` no workspace — o único lugar do pipeline que toca
 * disco, e faz isso só através de `storage/tree.ts`/`storage/environments.ts`, os
 * mesmos caminhos que qualquer outra criação de nó no app usa (EP-08-T01).
 *
 * Sequencial de propósito: `createNode` calcula `seq` a partir dos irmãos já no disco
 * no momento da chamada, então duas criações concorrentes no mesmo pai colidiriam.
 */

import type {
  FolderFile,
  FolderNode,
  ImportConflictResolution,
  ImportReport,
  ImportReportItem,
  RequestFile,
  RequestNode,
} from "@shared";

import type { NormalizedImport, NormalizedNode } from "./types";

import { osKeychainEncryption, type SecretEncryption } from "../secrets/encryption";
import { saveEnvironment } from "../storage/environments";
import { createNode, deleteNode, readNode, writeNode } from "../storage/tree";

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

async function findChildByName(
  root: string,
  parentPath: string,
  name: string,
): Promise<FolderNode["children"][number] | null> {
  const parent = await readNode(root, parentPath);
  if (parent.kind !== "folder") return null;
  return parent.children.find(child => child.name === name) ?? null;
}

/**
 * Grava `normalized.children` direto em `targetPath` — sem a pasta-raiz que
 * `emitImport` sempre cria — porque `targetPath` já é uma pasta existente do usuário
 * (EP-08-T07, "Import into this folder"). Cada índice de `resolutions` corresponde à
 * mesma posição em `ImportPreview.children` que o renderer usou para detectar o
 * conflito: sem resolução = sem conflito = grava normal; "skip" nunca cria nada;
 * "replace" apaga o nó existente de mesmo nome antes de criar; "rename" grava com
 * `newName` no lugar do nome original. Nenhuma dessas ações jamais apaga algo que o
 * usuário não tenha escolhido explicitamente substituir.
 *
 * Metadados de nível de collection (`auth`/`docs`/`variables`/`scripts` de
 * `normalized`) não têm onde ir sem uma pasta-raiz — reportados como não convertidos
 * em vez de perdidos em silêncio, mesmo princípio do resto do épico.
 */
export async function emitImportMerge(
  root: string,
  targetPath: string,
  normalized: NormalizedImport,
  resolutions: ImportConflictResolution[],
  encryption: SecretEncryption = osKeychainEncryption,
): Promise<ImportReport> {
  const counts: EmitCounts = { folders: 0, requests: 0, environments: 0 };
  const resolutionByIndex = new Map(resolutions.map(resolution => [resolution.index, resolution]));
  const notConverted: ImportReportItem[] = [...normalized.notConverted];

  for (let index = 0; index < normalized.children.length; index++) {
    const child = normalized.children[index];
    const resolution = resolutionByIndex.get(index);
    if (resolution?.action === "skip") continue;

    if (resolution?.action === "replace") {
      const existing = await findChildByName(root, targetPath, child.name);
      if (existing) await deleteNode(root, existing.path);
    }

    const nodeToEmit: NormalizedNode =
      resolution?.action === "rename" && resolution.newName
        ? { ...child, name: resolution.newName }
        : child;

    await emitNode(root, targetPath, nodeToEmit, counts);
  }

  const rootMetadata: [unknown, string][] = [
    [normalized.auth, "auth"],
    [normalized.docs, "docs"],
    [normalized.variables?.length, "variables"],
    [normalized.scripts, "scripts"],
  ];
  for (const [present, field] of rootMetadata) {
    if (present) {
      notConverted.push({
        path: normalized.name,
        reason: `collection-level ${field} not applied when importing into an existing folder`,
      });
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
    notConverted,
  };
}

/**
 * Camada de filesystem do workspace (EP-04-T04) — lê e grava a árvore inteira descrita
 * em docs/file-format.md §1: `wttp.yaml` na raiz, `environments/*.yaml`, e pastas que
 * viram `FolderNode`/`RequestNode` recursivamente. Cada arquivo é validado ao ser lido
 * (`validate.ts`); um nó inválido não derruba a árvore — vira `data: null` com
 * `issues`, e o resto do workspace continua utilizável (docs/file-format.md §7).
 *
 * Nomes de arquivo são sempre derivados de `name` via `slug.ts` — `path` num
 * `WorkspaceNode` é a verdade sobre onde o arquivo está no disco, não o `name`.
 */

import type {
  EnvironmentFile,
  FolderFile,
  RequestFile,
  WorkspaceFile,
  WorkspaceNode,
  WorkspaceNodeIssue,
  WorkspaceTree,
} from "@shared";

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import { DomainError } from "../ipc/errors";
import { writeFileAtomic } from "./fsAtomic";
import { ensureGitignore } from "./gitignore";
import { CURRENT_SCHEMA_VERSION } from "./migrations/registry";
import { resolveWorkspacePath } from "./paths";
import { serializeFolder, serializeRequest, serializeWorkspace } from "./serializer";
import {
  type SchemaIssue,
  validateEnvironment,
  validateFolder,
  validateRequest,
  validateWorkspace,
} from "./validate";
import {
  clearKnownMtimesUnder,
  getKnownMtime,
  markOwnWrite,
  recordKnownMtime,
} from "./writeTracker";

const WORKSPACE_FILE = "wttp.yaml";
const FOLDER_FILE = "folder.yaml";
const REQUEST_SUFFIX = ".req.yaml";
const ENVIRONMENTS_DIR = "environments";
const LOCAL_DIR = ".wttp";

/** Fallback de ordenação para um nó inválido, que não tem `seq` confiável — vai para o final. */
const UNSORTED_SEQ = Number.MAX_SAFE_INTEGER;

const relJoin = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);

const relDirname = (relPath: string): string => {
  const index = relPath.lastIndexOf("/");
  return index === -1 ? "" : relPath.slice(0, index);
};

const toNodeIssues = (issues: SchemaIssue[]): WorkspaceNodeIssue[] =>
  issues.map(issue => ({ path: issue.path, message: issue.message, line: issue.line }));

function compareNodes(a: WorkspaceNode, b: WorkspaceNode): number {
  return a.seq - b.seq || a.name.localeCompare(b.name);
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readRequestNode(root: string, relPath: string): Promise<WorkspaceNode> {
  const absPath = join(root, relPath);
  const raw = await fs.readFile(absPath, "utf-8");
  const result = validateRequest(raw);

  if (result.valid) {
    return {
      kind: "request",
      path: relPath,
      name: result.value.name,
      seq: result.value.seq,
      data: result.value,
    };
  }

  const fileName = relPath.slice(relPath.lastIndexOf("/") + 1);
  return {
    kind: "request",
    path: relPath,
    name: fileName.slice(0, -REQUEST_SUFFIX.length),
    seq: UNSORTED_SEQ,
    data: null,
    issues: toNodeIssues(result.issues),
  };
}

async function readFolderNode(root: string, relPath: string): Promise<WorkspaceNode> {
  const absDir = join(root, relPath);
  const folderYamlPath = join(absDir, FOLDER_FILE);

  let data: FolderFile | null = null;
  let issues: WorkspaceNodeIssue[] | undefined;
  let name = relPath.slice(relPath.lastIndexOf("/") + 1);
  let seq = UNSORTED_SEQ;

  if (await exists(folderYamlPath)) {
    const raw = await fs.readFile(folderYamlPath, "utf-8");
    const result = validateFolder(raw);
    if (result.valid) {
      data = result.value;
      name = data.name;
      seq = data.seq;
    } else {
      issues = toNodeIssues(result.issues);
    }
  }

  const children = await scanChildren(root, relPath);
  return { kind: "folder", path: relPath, name, seq, data, issues, children };
}

async function scanChildren(root: string, relDir: string): Promise<WorkspaceNode[]> {
  const absDir = join(root, relDir);
  const entries = await fs.readdir(absDir, { withFileTypes: true });

  const nodes = await Promise.all(
    entries.map(async (entry): Promise<WorkspaceNode | null> => {
      if (entry.name === LOCAL_DIR) return null;
      if (relDir === "" && (entry.name === ENVIRONMENTS_DIR || entry.name === WORKSPACE_FILE)) {
        return null;
      }

      const relPath = relJoin(relDir, entry.name);
      if (entry.isDirectory()) return readFolderNode(root, relPath);
      if (entry.isFile() && entry.name.endsWith(REQUEST_SUFFIX)) {
        return readRequestNode(root, relPath);
      }
      return null;
    }),
  );

  return nodes.filter((node): node is WorkspaceNode => node !== null).sort(compareNodes);
}

async function readEnvironments(root: string): Promise<EnvironmentFile[]> {
  const dir = join(root, ENVIRONMENTS_DIR);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries
      .filter(name => name.endsWith(".yaml") || name.endsWith(".yml"))
      .map(async name => {
        const raw = await fs.readFile(join(dir, name), "utf-8");
        const result = validateEnvironment(raw);
        return result.valid ? result.value : null;
      }),
  );

  return files.filter((file): file is EnvironmentFile => file !== null);
}

/** Varre o workspace inteiro a partir de `root` — usado por `workspace:open`/`workspace:create`. */
export async function scanWorkspace(root: string): Promise<WorkspaceTree> {
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new DomainError("ENOENT", `workspace directory not found: "${root}"`, root);
  }

  let data: WorkspaceFile | null = null;
  let issues: WorkspaceNodeIssue[] | undefined;
  const manifestPath = join(root, WORKSPACE_FILE);

  if (await exists(manifestPath)) {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const result = validateWorkspace(raw);
    if (result.valid) data = result.value;
    else issues = toNodeIssues(result.issues);
  } else {
    issues = [{ path: "", message: `workspace manifest not found: "${WORKSPACE_FILE}"` }];
  }

  const [environments, children] = await Promise.all([
    readEnvironments(root),
    scanChildren(root, ""),
  ]);

  return { root, data, issues, environments, children };
}

/** Caminho do arquivo que de fato guarda o conteúdo de um nó — o próprio arquivo para uma request, `folder.yaml` para uma pasta. */
function contentPath(absPath: string, kind: WorkspaceNode["kind"]): string {
  return kind === "folder" ? join(absPath, FOLDER_FILE) : absPath;
}

/** Lê um único nó — pasta (diretório) ou request (`*.req.yaml`) — usado por `node:read`. */
export async function readNode(root: string, relPath: string): Promise<WorkspaceNode> {
  const absPath = resolveWorkspacePath(root, relPath);
  const stat = await fs.stat(absPath).catch(() => null);
  if (!stat) throw new DomainError("ENOENT", `node not found: "${relPath}"`, relPath);

  const node = stat.isDirectory()
    ? await readFolderNode(root, relPath)
    : await readRequestNode(root, relPath);

  // Marca a versão vista agora — base de comparação para o `writeNode` que vier depois
  // recusar sobrescrever uma edição externa acontecida nesse meio-tempo.
  const contentStat = await fs.stat(contentPath(absPath, node.kind)).catch(() => null);
  if (contentStat) recordKnownMtime(contentPath(absPath, node.kind), contentStat.mtimeMs);

  return node;
}

/**
 * Recusa a escrita se o arquivo mudou no disco desde a última vez que este processo o
 * leu (`readNode`) ou escreveu — docs/backlog EP-04-T05: "nada é perdido
 * silenciosamente". Sem leitura prévia conhecida (nó recém-criado no app), não há o
 * que comparar e a escrita segue normalmente.
 */
async function assertNoConflict(path: string, relPath: string): Promise<void> {
  const known = getKnownMtime(path);
  if (known === undefined) return;

  const stat = await fs.stat(path).catch(() => null);
  if (!stat || stat.mtimeMs !== known) {
    throw new DomainError(
      "CONFLICT",
      `file changed on disk since it was last read: "${relPath}"`,
      relPath,
    );
  }
}

/** Serializa e grava `node.data` atomicamente no caminho do nó — usado por `node:write`. */
export async function writeNode(root: string, relPath: string, node: WorkspaceNode): Promise<void> {
  if (!node.data) {
    throw new DomainError("INVALID_PAYLOAD", "cannot write a node without data", relPath);
  }

  const absPath = resolveWorkspacePath(root, relPath);
  const path = contentPath(absPath, node.kind);
  await assertNoConflict(path, relPath);

  if (node.kind === "folder") {
    await writeFileAtomic(path, serializeFolder(node.data as FolderFile));
  } else {
    await writeFileAtomic(path, serializeRequest(node.data as RequestFile));
  }
}

/** Remove um nó — arquivo de request, ou diretório de pasta com tudo dentro — `node:delete`. */
export async function deleteNode(root: string, relPath: string): Promise<void> {
  const absPath = resolveWorkspacePath(root, relPath);
  markOwnWrite(absPath);
  await fs.rm(absPath, { recursive: true, force: true });
  clearKnownMtimesUnder(absPath);
}

async function writeSeq(root: string, node: WorkspaceNode, newSeq: number): Promise<void> {
  if (!node.data) return;
  const data = { ...node.data, seq: newSeq };
  await writeNode(root, node.path, { ...node, data, seq: newSeq } as WorkspaceNode);
}

/**
 * Move (ou reordena no lugar, quando `from === to`) um nó. Renumera `seq` só dos
 * irmãos cuja posição de fato muda — docs/backlog EP-04-T04: "reordena as linhas
 * afetadas e só elas". Mover entre pastas também fecha o buraco deixado na origem.
 */
export async function moveNode(root: string, from: string, to: string, seq: number): Promise<void> {
  const absFrom = resolveWorkspacePath(root, from);
  const absTo = resolveWorkspacePath(root, to);

  const moving = await readNode(root, from);
  const sourceDir = relDirname(from);
  const targetDir = relDirname(to);

  if (absFrom !== absTo) {
    await fs.mkdir(dirname(absTo), { recursive: true });
    markOwnWrite(absFrom);
    markOwnWrite(absTo);
    await fs.rename(absFrom, absTo);
    clearKnownMtimesUnder(absFrom);
  }

  const targetSiblings = (await scanChildren(root, targetDir))
    .filter(node => node.path !== to)
    .sort(compareNodes);

  const clampedSeq = Math.min(Math.max(Math.trunc(seq), 1), targetSiblings.length + 1);
  const movedNode: WorkspaceNode = { ...moving, path: to, seq: clampedSeq } as WorkspaceNode;

  const desiredOrder = [...targetSiblings];
  desiredOrder.splice(clampedSeq - 1, 0, movedNode);

  await Promise.all(
    desiredOrder.map((node, index) => {
      const newSeq = index + 1;
      const isMoved = node.path === to;
      return isMoved || node.seq !== newSeq ? writeSeq(root, node, newSeq) : Promise.resolve();
    }),
  );

  if (sourceDir !== targetDir) {
    const remaining = (await scanChildren(root, sourceDir)).sort(compareNodes);
    await Promise.all(
      remaining.map((node, index) => {
        const newSeq = index + 1;
        return node.seq !== newSeq ? writeSeq(root, node, newSeq) : Promise.resolve();
      }),
    );
  }
}

/** Cria um workspace novo: `wttp.yaml`, `environments/`, `.gitignore` com `.wttp/`. */
export async function initWorkspace(root: string, name: string): Promise<WorkspaceTree> {
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(join(root, ENVIRONMENTS_DIR), { recursive: true });
  await ensureGitignore(root);

  const workspaceFile: WorkspaceFile = { wttp: CURRENT_SCHEMA_VERSION, name };
  await writeFileAtomic(join(root, WORKSPACE_FILE), serializeWorkspace(workspaceFile));

  return scanWorkspace(root);
}

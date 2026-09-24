/**
 * Camada de filesystem do workspace (EP-04-T04) — lê e grava a árvore inteira descrita
 * em arch-docs/file-format.md §1: `wttp.yaml` na raiz, `environments/*.yaml`, e pastas que
 * viram `FolderNode`/`RequestNode` recursivamente. Cada arquivo é validado ao ser lido
 * (`validate.ts`); um nó inválido não derruba a árvore — vira `data: null` com
 * `issues`, e o resto do workspace continua utilizável (arch-docs/file-format.md §7).
 *
 * Nomes de arquivo são sempre derivados de `name` via `slug.ts` — `path` num
 * `WorkspaceNode` é a verdade sobre onde o arquivo está no disco, não o `name`.
 */

import type {
  EnvironmentFile,
  EnvironmentListItem,
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
import {
  serializeEnvironment,
  serializeFolder,
  serializeRequest,
  serializeWorkspace,
} from "./serializer";
import { uniqueSlugName } from "./slug";
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

/** Um diretório é um workspace válido se tiver `wttp.yaml` na raiz — mesma checagem usada por `scanWorkspace`. */
export async function hasWorkspaceManifest(root: string): Promise<boolean> {
  return exists(join(root, WORKSPACE_FILE));
}

/**
 * Lista as subpastas imediatas de `dir` (ex. `<workspacesRootDir>/wttp`), marcando
 * quais têm `wttp.yaml` — usado pelo switcher de workspaces (Preferences). `dir`
 * inexistente (raiz ainda não configurada) resolve `[]`, não lança.
 */
export async function listWorkspacesInDir(
  dir: string,
): Promise<{ path: string; name: string; valid: boolean }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter(entry => entry.isDirectory());
  return Promise.all(
    dirs.map(async entry => {
      const path = join(dir, entry.name);
      return { path, name: entry.name, valid: await hasWorkspaceManifest(path) };
    }),
  );
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
      // Pasta oculta (`.git`, `.github`, `.vscode`...) nunca é collection nem pasta de
      // requests — o app só cria pastas a partir de slugs, que nunca começam com ponto. Sem
      // isso, um workspace na raiz de um repositório mostrava `.git` na árvore (ClickLocal #51).
      if (entry.isDirectory() && entry.name.startsWith(".")) return null;
      if (entry.isDirectory()) return readFolderNode(root, relPath);
      if (entry.isFile() && entry.name.endsWith(REQUEST_SUFFIX)) {
        return readRequestNode(root, relPath);
      }
      return null;
    }),
  );

  return nodes.filter((node): node is WorkspaceNode => node !== null).sort(compareNodes);
}

/** Lista os environments válidos do workspace, com o `path` (nome do arquivo) de cada um — base de `env:list` (EP-06-T02). */
export async function listEnvironments(root: string): Promise<EnvironmentListItem[]> {
  const dir = join(root, ENVIRONMENTS_DIR);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const items = await Promise.all(
    entries
      .filter(name => name.endsWith(".yaml") || name.endsWith(".yml"))
      .map(async (path): Promise<EnvironmentListItem | null> => {
        const raw = await fs.readFile(join(dir, path), "utf-8");
        const result = validateEnvironment(raw);
        return result.valid ? { path, data: result.value } : null;
      }),
  );

  return items
    .filter((item): item is EnvironmentListItem => item !== null)
    .sort((a, b) => a.data.name.localeCompare(b.data.name));
}

async function readEnvironments(root: string): Promise<EnvironmentFile[]> {
  return (await listEnvironments(root)).map(item => item.data);
}

const ENVIRONMENT_SUFFIX = ".yaml";

function environmentAbsPath(root: string, path: string): string {
  return join(root, ENVIRONMENTS_DIR, path);
}

/** Lê um único environment por `path` — `null` quando não existe ou está inválido. */
export async function getEnvironment(
  root: string,
  path: string,
): Promise<EnvironmentListItem | null> {
  const raw = await fs.readFile(environmentAbsPath(root, path), "utf-8").catch(() => null);
  if (raw === null) return null;

  const result = validateEnvironment(raw);
  return result.valid ? { path, data: result.value } : null;
}

/** Cria um environment novo (EP-06-T02) — `environments/<slug>.yaml`, nome de arquivo derivado de `name`. */
export async function createEnvironment(root: string, name: string): Promise<EnvironmentListItem> {
  const dir = join(root, ENVIRONMENTS_DIR);
  await fs.mkdir(dir, { recursive: true });

  const existingNames = await listEntryNames(dir);
  const path = uniqueSlugName(name, ENVIRONMENT_SUFFIX, candidate => existingNames.has(candidate));

  const data: EnvironmentFile = { wttp: CURRENT_SCHEMA_VERSION, name, variables: [] };
  await writeFileAtomic(environmentAbsPath(root, path), serializeEnvironment(data));
  return { path, data };
}

/**
 * Sobrescreve o conteúdo de um environment existente. `path` nunca muda aqui — ver o
 * comentário de `EnvironmentListItem` em `@shared` sobre por que o arquivo não é
 * renomeado quando `environment.name` muda.
 */
export async function writeEnvironment(
  root: string,
  path: string,
  environment: EnvironmentFile,
): Promise<EnvironmentListItem> {
  const absPath = environmentAbsPath(root, path);
  await assertNoConflict(absPath, `${ENVIRONMENTS_DIR}/${path}`);
  await writeFileAtomic(absPath, serializeEnvironment(environment));
  return { path, data: environment };
}

/** Remove um environment — o chamador (EP-06-T02, `ipc/environment.ts`) cuida de apagar os segredos associados antes. */
export async function deleteEnvironment(root: string, path: string): Promise<void> {
  const absPath = environmentAbsPath(root, path);
  markOwnWrite(absPath);
  await fs.rm(absPath, { force: true });
  clearKnownMtimesUnder(absPath);
}

/**
 * Duplica um environment — nome único (`"Dev" → "Dev copy" → "Dev copy 2"`), arquivo
 * novo com `path` próprio. Nunca copia valor de variável secreta (arch-docs/backlog
 * EP-06-T03): a linha é duplicada com `value: ""`, o segredo original permanece só no
 * environment de origem.
 */
export async function duplicateEnvironment(
  root: string,
  path: string,
): Promise<EnvironmentListItem> {
  const source = await getEnvironment(root, path);
  if (!source) {
    throw new DomainError("ENOENT", `environment not found: "${path}"`, path);
  }

  const dir = join(root, ENVIRONMENTS_DIR);
  const existingDisplayNames = new Set((await listEnvironments(root)).map(item => item.data.name));

  let candidateName = `${source.data.name} copy`;
  for (let n = 2; existingDisplayNames.has(candidateName); n++) {
    candidateName = `${source.data.name} copy ${n}`;
  }

  const existingNames = await listEntryNames(dir);
  const newPath = uniqueSlugName(candidateName, ENVIRONMENT_SUFFIX, candidate =>
    existingNames.has(candidate),
  );

  const data: EnvironmentFile = {
    ...source.data,
    name: candidateName,
    variables: source.data.variables?.map(variable =>
      variable.secret ? { ...variable, value: "" } : variable,
    ),
  };

  await writeFileAtomic(environmentAbsPath(root, newPath), serializeEnvironment(data));
  return { path: newPath, data };
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
 * leu (`readNode`) ou escreveu — arch-docs/backlog EP-04-T05: "nada é perdido
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
 * irmãos cuja posição de fato muda — arch-docs/backlog EP-04-T04: "reordena as linhas
 * afetadas e só elas". Mover entre pastas também fecha o buraco deixado na origem.
 */
export async function moveNode(root: string, from: string, to: string, seq: number): Promise<void> {
  // Recusa mover uma pasta para dentro dela mesma ou de um dos seus descendentes —
  // defesa em profundidade além da checagem já feita no `WTree` (EP-05-T04).
  if (from !== to && (to === from || to.startsWith(`${from}/`))) {
    throw new DomainError(
      "INVALID_PAYLOAD",
      `cannot move a node into its own descendant: "${from}" → "${to}"`,
      to,
    );
  }

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

/**
 * Sobrescreve `variables` do manifesto do workspace (EP-06-T03 — aba de variáveis
 * globais do editor de environments), preservando os demais campos.
 */
export async function updateWorkspaceVariables(
  root: string,
  variables: WorkspaceFile["variables"],
): Promise<WorkspaceTree> {
  const manifestPath = join(root, WORKSPACE_FILE);
  const raw = await fs.readFile(manifestPath, "utf-8");
  const result = validateWorkspace(raw);
  if (!result.valid) {
    throw new DomainError("SCHEMA_INVALID", `workspace manifest is invalid: "${WORKSPACE_FILE}"`);
  }

  await assertNoConflict(manifestPath, WORKSPACE_FILE);
  const next: WorkspaceFile = { ...result.value, variables };
  await writeFileAtomic(manifestPath, serializeWorkspace(next));

  return scanWorkspace(root);
}

async function listEntryNames(absDir: string): Promise<Set<string>> {
  try {
    return new Set(await fs.readdir(absDir));
  } catch {
    return new Set();
  }
}

/** Cria uma pasta ou request nova dentro de `parentPath` (EP-05-T03) — vai para o fim. */
export async function createNode(
  root: string,
  parentPath: string,
  kind: WorkspaceNode["kind"],
  name: string,
): Promise<WorkspaceNode> {
  const absParent = resolveWorkspacePath(root, parentPath);
  await fs.mkdir(absParent, { recursive: true });

  const existingNames = await listEntryNames(absParent);
  const suffix = kind === "request" ? REQUEST_SUFFIX : "";
  const slug = uniqueSlugName(name, suffix, candidate => existingNames.has(candidate));
  const relPath = relJoin(parentPath, slug);

  const siblings = (await scanChildren(root, parentPath)).sort(compareNodes);
  const seq = siblings.length + 1;

  if (kind === "folder") {
    const data: FolderFile = { wttp: CURRENT_SCHEMA_VERSION, name, seq };
    await fs.mkdir(join(absParent, slug), { recursive: true });
    await writeFileAtomic(join(absParent, slug, FOLDER_FILE), serializeFolder(data));
    return { kind: "folder", path: relPath, name, seq, data, children: [] };
  }

  const data: RequestFile = { wttp: CURRENT_SCHEMA_VERSION, name, seq, method: "GET", url: "" };
  await writeFileAtomic(join(absParent, slug), serializeRequest(data));
  return { kind: "request", path: relPath, name, seq, data };
}

/**
 * Renomeia um nó — atualiza `data.name` e, se o slug derivado mudar, move o
 * arquivo/diretório para o novo nome (mesma posição entre os irmãos). Só nós com
 * `data` válido podem ser renomeados — um nó inválido não tem o que reescrever.
 */
export async function renameNode(root: string, path: string, name: string): Promise<WorkspaceNode> {
  const node = await readNode(root, path);
  if (!node.data) {
    throw new DomainError("INVALID_PAYLOAD", `cannot rename a node without data: "${path}"`, path);
  }

  const parentDir = relDirname(path);
  const absParentDir = resolveWorkspacePath(root, parentDir);
  const currentBasename = path.slice(path.lastIndexOf("/") + 1);
  const existingNames = await listEntryNames(absParentDir);
  existingNames.delete(currentBasename);

  const suffix = node.kind === "request" ? REQUEST_SUFFIX : "";
  const newSlug = uniqueSlugName(name, suffix, candidate => existingNames.has(candidate));
  const newPath = relJoin(parentDir, newSlug);

  const updatedNode = { ...node, data: { ...node.data, name } } as WorkspaceNode;
  await writeNode(root, path, updatedNode);

  if (newPath === path) return readNode(root, path);

  await moveNode(root, path, newPath, node.seq);
  return readNode(root, newPath);
}

/**
 * Duplica um nó — nome único (`"X" → "X copy" → "X copy 2"`), inserido logo após o
 * original entre os irmãos. Pasta duplica a árvore inteira recursivamente. Request
 * inválida (`data: null`) não pode ser duplicada — não há conteúdo para copiar.
 */
export async function duplicateNode(root: string, path: string): Promise<WorkspaceNode> {
  const node = await readNode(root, path);
  if (node.kind === "request" && !node.data) {
    throw new DomainError(
      "INVALID_PAYLOAD",
      `cannot duplicate an invalid request: "${path}"`,
      path,
    );
  }

  const parentDir = relDirname(path);
  const absParentDir = resolveWorkspacePath(root, parentDir);
  const siblings = (await scanChildren(root, parentDir)).sort(compareNodes);
  const existingDisplayNames = new Set(siblings.map(sibling => sibling.name));

  let candidateName = `${node.name} copy`;
  for (let n = 2; existingDisplayNames.has(candidateName); n++) {
    candidateName = `${node.name} copy ${n}`;
  }

  const existingFsNames = await listEntryNames(absParentDir);
  const suffix = node.kind === "request" ? REQUEST_SUFFIX : "";
  const newSlug = uniqueSlugName(candidateName, suffix, candidate =>
    existingFsNames.has(candidate),
  );
  const newPath = relJoin(parentDir, newSlug);

  const absFrom = resolveWorkspacePath(root, path);
  const absTo = resolveWorkspacePath(root, newPath);

  if (node.kind === "folder") {
    await fs.cp(absFrom, absTo, { recursive: true });
    if (node.data) {
      const updated: FolderFile = { ...node.data, name: candidateName };
      await writeFileAtomic(join(absTo, FOLDER_FILE), serializeFolder(updated));
    }
  } else {
    const updated: RequestFile = { ...(node.data as RequestFile), name: candidateName };
    await writeFileAtomic(absTo, serializeRequest(updated));
  }

  // Insere logo depois do original e renumera só quem precisa — mesma lógica de
  // reindexação de `moveNode`, reaproveitada passando `from === to`.
  await moveNode(root, newPath, newPath, node.seq + 1);
  return readNode(root, newPath);
}

/**
 * Move ou reordena um nó por drag & drop (EP-05-T04) — `index` é a posição (1-indexed)
 * entre os irmãos de `targetDir`. Mantém o nome de arquivo atual a menos que colida no
 * destino, caso em que resolve como `duplicateNode`. Fino em cima de `moveNode`, que já
 * faz o resto (reindexação mínima, guarda contra mover para dentro de si mesma).
 */
export async function moveNodeInto(
  root: string,
  from: string,
  targetDir: string,
  index: number,
): Promise<WorkspaceNode> {
  const node = await readNode(root, from);
  const sourceDir = relDirname(from);
  const basename = from.slice(from.lastIndexOf("/") + 1);

  const absTargetDir = resolveWorkspacePath(root, targetDir);
  const existingNames = await listEntryNames(absTargetDir);
  if (targetDir === sourceDir) existingNames.delete(basename);

  let newBasename = basename;
  if (existingNames.has(basename)) {
    const suffix = node.kind === "request" ? REQUEST_SUFFIX : "";
    newBasename = uniqueSlugName(node.name, suffix, candidate => existingNames.has(candidate));
  }

  const to = relJoin(targetDir, newBasename);
  await moveNode(root, from, to, index);
  return readNode(root, to);
}

/**
 * Copia `from` para dentro de `targetDir`, sempre no fim (EP-09.1-T04) — mantém o
 * original no lugar, ao contrário de `moveNodeInto`. Mesma resolução de nome colidido
 * de `moveNodeInto`/`duplicateNode`; reaproveita `moveNode(to, to, ...)` só para
 * renumerar a cópia já no lugar certo, mesmo truque de `duplicateNode`.
 */
export async function copyNodeInto(
  root: string,
  from: string,
  targetDir: string,
): Promise<WorkspaceNode> {
  const node = await readNode(root, from);
  if (node.kind === "folder" && (targetDir === from || targetDir.startsWith(`${from}/`))) {
    throw new DomainError(
      "INVALID_PAYLOAD",
      `cannot copy a folder into itself or a descendant: "${from}" → "${targetDir}"`,
      targetDir,
    );
  }

  const basename = from.slice(from.lastIndexOf("/") + 1);
  const absTargetDir = resolveWorkspacePath(root, targetDir);
  const existingNames = await listEntryNames(absTargetDir);

  let newBasename = basename;
  if (existingNames.has(basename)) {
    const suffix = node.kind === "request" ? REQUEST_SUFFIX : "";
    newBasename = uniqueSlugName(node.name, suffix, candidate => existingNames.has(candidate));
  }

  const to = relJoin(targetDir, newBasename);
  const absFrom = resolveWorkspacePath(root, from);
  const absTo = resolveWorkspacePath(root, to);

  await fs.mkdir(absTargetDir, { recursive: true });
  await fs.cp(absFrom, absTo, { recursive: node.kind === "folder" });

  await moveNode(root, to, to, Number.MAX_SAFE_INTEGER);
  return readNode(root, to);
}

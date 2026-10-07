/**
 * Anexos da documentação (`attachments/` na raiz do workspace) — imagens e vídeos que o
 * markdown de `docs` referencia, versionados junto com os YAMLs. arch-docs/file-format.md §9.
 *
 * O nome do arquivo gravado é `<slug>-<8 hex do sha256>.<ext>`: o hash do conteúdo torna a
 * gravação idempotente (o mesmo arquivo anexado duas vezes é um arquivo só, sem diff) e
 * evita colisão entre dois arquivos diferentes com o mesmo nome. Só o main toca em disco.
 */

import type { AttachmentInfo, AttachmentKind } from "@shared";

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, extname, join } from "node:path";

import { DomainError } from "../ipc/errors";
import { resolveWorkspacePath } from "./paths";

export const ATTACHMENTS_DIR = "attachments";

/** 50 MB por arquivo — acima disso o repositório do usuário sofre; a mensagem diz isso e sugere Git LFS. */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** Só tipos que o Chromium do app reproduz sozinho. SVG entra como imagem (carregado em `<img>`, não executa script). */
const TYPES: Record<string, { kind: AttachmentKind; mime: string }> = {
  ".png": { kind: "image", mime: "image/png" },
  ".jpg": { kind: "image", mime: "image/jpeg" },
  ".jpeg": { kind: "image", mime: "image/jpeg" },
  ".gif": { kind: "image", mime: "image/gif" },
  ".webp": { kind: "image", mime: "image/webp" },
  ".svg": { kind: "image", mime: "image/svg+xml" },
  ".mp4": { kind: "video", mime: "video/mp4" },
  ".webm": { kind: "video", mime: "video/webm" },
};

export const ATTACHMENT_EXTENSIONS = Object.keys(TYPES).map(ext => ext.slice(1));

export function attachmentType(fileName: string): { kind: AttachmentKind; mime: string } | null {
  return TYPES[extname(fileName).toLowerCase()] ?? null;
}

function slugBase(fileName: string): string {
  const base = basename(fileName, extname(fileName))
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "file";
}

/** Grava `data` em `attachments/` e devolve o caminho a referenciar no markdown. */
export async function saveAttachment(
  root: string,
  fileName: string,
  data: Uint8Array,
): Promise<AttachmentInfo> {
  const type = attachmentType(fileName);
  if (!type) {
    throw new DomainError(
      "ATTACHMENT_TYPE",
      `unsupported attachment type: "${fileName}" (allowed: ${ATTACHMENT_EXTENSIONS.join(", ")})`,
      fileName,
    );
  }
  if (data.byteLength === 0) {
    throw new DomainError("ATTACHMENT_EMPTY", `attachment is empty: "${fileName}"`, fileName);
  }
  if (data.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new DomainError(
      "ATTACHMENT_TOO_LARGE",
      `attachment exceeds ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB: "${fileName}" (consider Git LFS)`,
      fileName,
    );
  }

  const hash = createHash("sha256").update(data).digest("hex").slice(0, 8);
  const name = `${slugBase(fileName)}-${hash}${extname(fileName).toLowerCase()}`;
  const path = `${ATTACHMENTS_DIR}/${name}`;
  const absolute = resolveWorkspacePath(root, path);

  await fs.mkdir(join(root, ATTACHMENTS_DIR), { recursive: true });
  // `wx`: já existe com este hash → mesmo conteúdo, nada a regravar.
  await fs.writeFile(absolute, data, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });

  return { path, kind: type.kind, bytes: data.byteLength };
}

/**
 * Resolve um caminho de anexo do renderer/protocolo para o arquivo absoluto. Recusa o que
 * não está em `attachments/` ou não é de um tipo permitido — o protocolo `wttp-attachment:`
 * nunca serve outro arquivo do workspace (YAMLs, `.wttp/secrets.json`).
 */
export function resolveAttachmentFile(root: string, path: string): string {
  if (!path.startsWith(`${ATTACHMENTS_DIR}/`) || !attachmentType(path)) {
    throw new DomainError("ATTACHMENT_PATH", `not an attachment path: "${path}"`, path);
  }
  const absolute = resolveWorkspacePath(root, path);
  const rel = absolute.slice(join(root, ATTACHMENTS_DIR).length + 1);
  if (rel.includes("/") || rel.includes("\\")) {
    throw new DomainError("ATTACHMENT_PATH", `not an attachment path: "${path}"`, path);
  }
  return absolute;
}

export async function readAttachment(
  root: string,
  path: string,
): Promise<{ data: Uint8Array; mime: string }> {
  const absolute = resolveAttachmentFile(root, path);
  const buffer = await fs.readFile(absolute).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      throw new DomainError("ENOENT", `attachment not found: "${path}"`, path);
    }
    throw error;
  });
  return { data: new Uint8Array(buffer), mime: attachmentType(path)!.mime };
}

/** Todos os anexos de `attachments/` com tamanho, em ordem de nome — base da limpeza de não usados. */
export async function listAttachments(root: string): Promise<AttachmentInfo[]> {
  const dir = join(root, ATTACHMENTS_DIR);
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });

  const files: AttachmentInfo[] = [];
  for (const entry of entries) {
    const type = entry.isFile() ? attachmentType(entry.name) : null;
    if (!type) continue;
    const { size } = await fs.stat(join(dir, entry.name));
    files.push({ path: `${ATTACHMENTS_DIR}/${entry.name}`, kind: type.kind, bytes: size });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Apaga de vez um anexo — só para o fallback de quando a lixeira do SO não existe (`attachment:trash`). */
export async function deleteAttachment(root: string, path: string): Promise<void> {
  await fs.rm(resolveAttachmentFile(root, path), { force: true });
}

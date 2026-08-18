/**
 * Histórico de execuções por request (EP-08.1-T03), em `.wttp/history/<slug>.json` —
 * um arquivo por request, as `MAX_ENTRIES` mais recentes primeiro, gitignored (sob
 * `.wttp/`). Segredo nunca entra: `appendHistory` mascara `secrets` (os valores reais
 * de variável `secret: true` usados nesta request) e sempre mascara o header
 * `Authorization` inteiro, reaplicando `applyAuth` para capturar também o que a engine
 * injeta depois que o renderer já mandou a request (docs/backlog EP-08.1-T03).
 */

import type {
  HistoryEntry,
  HttpRequestSpec,
  HttpResponseResult,
  RequestBody,
  WttpError,
} from "@shared";

import { promises as fs } from "node:fs";
import { join } from "node:path";

import { applyAuth } from "../http/auth";
import { writeFileAtomic } from "./fsAtomic";
import { historySlug } from "./historySlug";

const LOCAL_DIR = ".wttp";
const HISTORY_DIR = "history";
export const MAX_ENTRIES = 10;
export const MAX_BODY_BYTES = 256_000;
const REDACTED = "[secret]";

function historyFilePath(root: string, requestPath: string): string {
  return join(root, LOCAL_DIR, HISTORY_DIR, `${historySlug(requestPath)}.json`);
}

function maskText(text: string, secrets: string[]): string {
  let masked = text;
  for (const secret of secrets) {
    if (!secret) continue;
    masked = masked.split(secret).join(REDACTED);
  }
  return masked;
}

function maskBody(body: RequestBody, secrets: string[]): RequestBody {
  switch (body.type) {
    case "json":
      return { ...body, json: maskText(body.json, secrets) };
    case "raw":
      return { ...body, raw: maskText(body.raw, secrets) };
    case "urlencoded":
      return {
        ...body,
        urlencoded: body.urlencoded.map(entry => ({
          ...entry,
          value: maskText(entry.value, secrets),
        })),
      };
    // multipart/binary só carregam caminho de arquivo (referência), não conteúdo —
    // nada pra mascarar. "none" não tem corpo.
    default:
      return body;
  }
}

function maskRequest(spec: HttpRequestSpec, secrets: string[]): HistoryEntry["request"] {
  // A engine só injeta `Authorization`/API key dentro de `sendHttpRequest` (EP-07-T02),
  // depois que o renderer já chamou `http:send` — sem reaplicar aqui, o histórico
  // nunca veria a auth de verdade usada.
  const withAuth = applyAuth(spec);
  return {
    method: withAuth.method,
    url: maskText(withAuth.url, secrets),
    query: withAuth.query.map(entry => ({ ...entry, value: maskText(entry.value, secrets) })),
    headers: withAuth.headers.map(header =>
      header.name.toLowerCase() === "authorization"
        ? { ...header, value: REDACTED }
        : { ...header, value: maskText(header.value, secrets) },
    ),
    body: maskBody(withAuth.body, secrets),
  };
}

function decodeBody(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function truncateUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf-8") <= maxBytes) return { text, truncated: false };
  return {
    text: Buffer.from(text, "utf-8").subarray(0, maxBytes).toString("utf-8"),
    truncated: true,
  };
}

function maskError(error: WttpError, secrets: string[]): WttpError {
  return { ...error, message: maskText(error.message, secrets) };
}

function maskResponse(res: HttpResponseResult, secrets: string[]): HistoryEntry["response"] {
  if (!res.ok) return { ok: false, error: maskError(res.error, secrets) };

  const decoded = maskText(decodeBody(res.body, res.charset), secrets);
  const { text, truncated } = truncateUtf8(decoded, MAX_BODY_BYTES);
  return {
    ok: true,
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
    charset: res.charset,
    size: res.size,
    timing: res.timing,
    body: text,
    bodyTruncated: truncated,
  };
}

export async function readHistory(root: string, requestPath: string): Promise<HistoryEntry[]> {
  try {
    const raw = await fs.readFile(historyFilePath(root, requestPath), "utf-8");
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export interface AppendHistoryInput {
  request: HttpRequestSpec;
  response: HttpResponseResult;
  secrets: string[];
}

export async function appendHistory(
  root: string,
  requestPath: string,
  input: AppendHistoryInput,
): Promise<void> {
  const existing = await readHistory(root, requestPath);
  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    request: maskRequest(input.request, input.secrets),
    response: maskResponse(input.response, input.secrets),
  };
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  await writeFileAtomic(historyFilePath(root, requestPath), JSON.stringify(next, null, 2));
}

/** `history:clear` e `node:delete` (EP-08.1-T03) — mesma operação: apagar o arquivo, sem erro se ele não existir. */
export async function deleteHistoryFile(root: string, requestPath: string): Promise<void> {
  await fs.rm(historyFilePath(root, requestPath), { force: true });
}

/** `node:rename` (EP-08.1-T03) — o slug depende do `path`, então renomear a request move o arquivo de histórico. */
export async function renameHistoryFile(
  root: string,
  oldPath: string,
  newPath: string,
): Promise<void> {
  try {
    await fs.rename(historyFilePath(root, oldPath), historyFilePath(root, newPath));
  } catch {
    // Sem histórico prévio para essa request — nada para mover.
  }
}

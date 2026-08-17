import type { KeyValueEntry, MultipartEntry, RequestBody } from "@shared";

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export interface BuiltBody {
  buffer: Buffer;
  /** `Content-Type` sugerido pelo tipo de body; ausente quando o tipo não define um. */
  contentType?: string;
}

/**
 * Monta o corpo de uma request a partir de um `RequestBody` já resolvido (sem
 * `{{vars}}` — isso é EP-06). Caminhos de `binary` e de entradas `type: "file"` em
 * `multipart` são lidos como estão: quem monta o `HttpRequestSpec` já os resolveu
 * para um caminho absoluto, do mesmo jeito que resolve auth antes de chamar a engine.
 */
export async function buildRequestBody(body: RequestBody): Promise<BuiltBody | undefined> {
  switch (body.type) {
    case "none":
      return undefined;
    case "json":
      return { buffer: Buffer.from(body.json, "utf-8"), contentType: "application/json" };
    case "raw":
      return { buffer: Buffer.from(body.raw, "utf-8"), contentType: body.contentType };
    case "urlencoded":
      return buildUrlencodedBody(body.urlencoded);
    case "binary":
      return { buffer: await readFile(body.binary), contentType: "application/octet-stream" };
    case "multipart":
      return buildMultipartBody(body.multipart);
  }
}

function buildUrlencodedBody(entries: KeyValueEntry[]): BuiltBody {
  const params = new URLSearchParams();
  for (const entry of entries) {
    if (entry.enabled) params.append(entry.name, entry.value);
  }
  return {
    buffer: Buffer.from(params.toString(), "utf-8"),
    contentType: "application/x-www-form-urlencoded",
  };
}

async function buildMultipartBody(entries: MultipartEntry[]): Promise<BuiltBody> {
  const boundary = `wttp-${randomBytes(16).toString("hex")}`;
  const parts: Buffer[] = [];

  for (const entry of entries) {
    if (!entry.enabled) continue;

    if (entry.type === "file") {
      const fileBuffer = await readFile(entry.value);
      parts.push(
        Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${entry.name}"; filename="${basename(entry.value)}"\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`,
        ),
        fileBuffer,
        Buffer.from("\r\n"),
      );
    } else {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${entry.name}"\r\n\r\n${entry.value}\r\n`,
        ),
      );
    }
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    buffer: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

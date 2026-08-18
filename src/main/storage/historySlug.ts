/**
 * Nome de arquivo para o histórico de uma request (EP-08.1-T03) — `path` vira um slug
 * curto (`users/list.req.yaml` → `users-list`), com um hash curto do `path` completo
 * anexado para desempatar duas requests que colidiriam no mesmo slug legível (ex.
 * `Users/List` e `users list`). Módulo próprio, não `slug.ts` (que deriva nome de
 * arquivo a partir de `name`, não de `path` — objetivo diferente).
 */

import { createHash } from "node:crypto";

const HASH_LENGTH = 8;

function readableSlug(requestPath: string): string {
  const base = requestPath
    .replace(/\.req\.yaml$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "request";
}

export function historySlug(requestPath: string): string {
  const hash = createHash("sha1").update(requestPath).digest("hex").slice(0, HASH_LENGTH);
  return `${readableSlug(requestPath)}-${hash}`;
}

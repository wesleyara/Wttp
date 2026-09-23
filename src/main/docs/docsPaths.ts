import { existsSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";

/**
 * `/guia/request` → `guia/request.html`, `/guia/` → `guia/index.html`. Devolve `null`
 * para qualquer caminho que escape de `root` (`..`) — o protocolo nunca serve um
 * arquivo fora da pasta da documentação.
 */
export function resolveDocsFile(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = normalize(decoded.replace(/^\/+/, ""));
  const candidate = join(root, relative);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;

  const options = [candidate, `${candidate}.html`, join(candidate, "index.html")];
  for (const option of options) {
    if (existsSync(option) && statSync(option).isFile()) return option;
  }
  return null;
}

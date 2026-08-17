/**
 * Resolução de caminhos relativos à raiz do workspace — docs/file-format.md §4:
 * caminhos de arquivo em `body` (binary, multipart) são sempre relativos à raiz,
 * nunca absolutos, e um `../` que escaparia da raiz é recusado.
 */

import { relative, resolve, sep } from "node:path";

import { DomainError } from "../ipc/errors";

/**
 * Resolve `relativePath` contra `root` e recusa qualquer resultado fora dele — inclui
 * `../` e caminhos absolutos passados por engano, já que ambos produzem um `relative()`
 * começando por `..` quando escapam da raiz.
 */
export function resolveWorkspacePath(root: string, relativePath: string): string {
  const absoluteRoot = resolve(root);
  const resolved = resolve(absoluteRoot, relativePath);
  const rel = relative(absoluteRoot, resolved);

  if (rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new DomainError(
      "PATH_ESCAPES_ROOT",
      `path escapes the workspace root: "${relativePath}"`,
      relativePath,
    );
  }

  return resolved;
}

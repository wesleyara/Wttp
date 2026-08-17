/**
 * Superfície pública de `@shared`.
 *
 * `export type *` garante que o módulo seja apagado por completo na compilação —
 * nenhum dos três bundles ganha um import em runtime por causa desta pasta.
 */

export type * from "./ipc";
export type * from "./http";

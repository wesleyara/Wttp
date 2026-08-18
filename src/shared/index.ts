/**
 * Superfície pública de `@shared`.
 *
 * `export type *` garante que o módulo seja apagado por completo na compilação —
 * nenhum dos três bundles ganha um import em runtime por causa desta pasta.
 */

export type * from "./ipc";
export type * from "./http";
export type * from "./history";
export type * from "./import";
export type * from "./scripting";
export type * from "./storage";

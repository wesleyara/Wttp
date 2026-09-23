import type { WttpErrorCode } from "@shared";

import { i18n } from "@renderer/i18n";

/** Mensagem acionável por código de erro (EP-03-T07) — nunca "erro desconhecido" cru. */
const KNOWN_CODES: readonly WttpErrorCode[] = [
  "DNS_ERROR",
  "TLS_ERROR",
  "TIMEOUT",
  "CANCELLED",
  "CONNECTION_REFUSED",
  "REQUEST_FAILED",
];

export function describeRequestError(code: WttpErrorCode): string {
  const key = KNOWN_CODES.includes(code) ? code : "UNKNOWN";
  return i18n.global.t(`response.errors.${key}`);
}

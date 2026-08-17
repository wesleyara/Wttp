import type { WttpErrorCode } from "@shared";

/** Mensagem acionável por código de erro (EP-03-T07) — nunca "erro desconhecido" cru. */
const MESSAGES: Partial<Record<WttpErrorCode, string>> = {
  DNS_ERROR: "Could not resolve the host. Check the URL and your network connection.",
  TLS_ERROR:
    "The TLS/SSL handshake failed. The certificate may be invalid or self-signed — check the workspace's validateTls setting.",
  TIMEOUT:
    "The request timed out. The server may be slow or unreachable — try increasing the timeout in the request settings.",
  CANCELLED: "The request was cancelled.",
  CONNECTION_REFUSED:
    "The connection was refused. Check that the host and port are correct and the server is running.",
  REQUEST_FAILED: "The request failed. See the detail below for more information.",
};

export function describeRequestError(code: WttpErrorCode): string {
  return MESSAGES[code] ?? "An unexpected error occurred while sending the request.";
}

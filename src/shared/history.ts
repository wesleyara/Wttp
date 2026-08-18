/**
 * Histórico de execuções por request (EP-08.1-T03), em `.wttp/history/<slug>.json` —
 * as 10 últimas, mais recente primeiro. Sempre já mascarado (segredo nunca chega ao
 * disco) — quem grava é sempre o main (`main/storage/history.ts`), nunca o renderer.
 */

import type { HttpMethod, HttpSize, HttpTiming, KeyValueEntry, RequestBody } from "./http";
import type { WttpError } from "./ipc";

/** Já com `Authorization` mascarado e qualquer variável `secret: true` usada substituída. */
export interface HistoryRequestSnapshot {
  method: HttpMethod;
  url: string;
  query: KeyValueEntry[];
  headers: KeyValueEntry[];
  body: RequestBody;
}

export type HistoryResponseSnapshot =
  | {
      ok: true;
      status: number;
      statusText: string;
      headers: KeyValueEntry[];
      charset: string;
      size: HttpSize;
      timing: HttpTiming;
      /** Decodificado com `charset`, truncado em `MAX_BODY_BYTES` quando maior. */
      body: string;
      bodyTruncated: boolean;
    }
  | { ok: false; error: WttpError };

export interface HistoryEntry {
  id: string;
  /** ISO 8601. */
  at: string;
  request: HistoryRequestSnapshot;
  response: HistoryResponseSnapshot;
}

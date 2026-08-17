import type { KeyValueRow } from "@renderer/components/WKeyValueTable.vue";
import type { KeyValueEntry } from "@shared";
import type { Ref, WritableComputedRef } from "vue";

import { computed } from "vue";

/**
 * Adapta um `Ref<KeyValueEntry[]>` (`description?: string`) para o `KeyValueRow[]`
 * (`description: string`) que `WKeyValueTable` espera — usado por Params, Headers e
 * pelas linhas de texto do body `urlencoded`.
 */
export function useKeyValueRows(source: Ref<KeyValueEntry[]>): WritableComputedRef<KeyValueRow[]> {
  return computed<KeyValueRow[]>({
    get: () => source.value.map(row => ({ ...row, description: row.description ?? "" })),
    set: rows => {
      source.value = rows;
    },
  });
}

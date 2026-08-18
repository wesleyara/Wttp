import type { KeyValueEntry, RequestBody } from "@shared";
import type { Ref } from "vue";

import { computed, ref, watch } from "vue";

const AUTO_CONTENT_TYPE: Partial<Record<RequestBody["type"], string>> = {
  json: "application/json",
  urlencoded: "application/x-www-form-urlencoded",
  binary: "application/octet-stream",
};

function findContentTypeIndex(rows: { name: string }[]): number {
  return rows.findIndex(row => row.name.toLowerCase() === "content-type");
}

/**
 * Mantém o header Content-Type em sincronia com o tipo de body, sobrescritível à mão —
 * apagar a linha à mão volta a aceitar sugestão automática. `body`/`headers` são a
 * fachada da aba ativa (`useRequestStore`), então trocar de aba também dispara isso
 * (o body muda sem o usuário ter editado nada) — por isso cada escrita só acontece
 * quando o header ainda não tem o valor sugerido, nunca incondicional.
 */
export function useAutoContentType(body: Ref<RequestBody>, headers: Ref<KeyValueEntry[]>): void {
  const suggestedContentType = computed(() => {
    const b = body.value;
    if (b.type === "raw") return b.contentType || undefined;
    return AUTO_CONTENT_TYPE[b.type];
  });

  let applyingAutoContentType = false;
  const contentTypeIsAuto = ref(true);

  watch(suggestedContentType, suggestion => {
    if (!suggestion || !contentTypeIsAuto.value) return;
    const index = findContentTypeIndex(headers.value);
    if (index !== -1 && headers.value[index].value === suggestion) return;

    applyingAutoContentType = true;
    const next = [...headers.value];
    if (index === -1) {
      next.push({ name: "Content-Type", value: suggestion, enabled: true, description: "" });
    } else {
      next[index] = { ...next[index], value: suggestion };
    }
    headers.value = next;
    applyingAutoContentType = false;
  });

  watch(
    headers,
    next => {
      if (applyingAutoContentType) return;
      const index = findContentTypeIndex(next);
      if (index === -1) {
        contentTypeIsAuto.value = true;
        return;
      }
      if (next[index].value !== suggestedContentType.value) contentTypeIsAuto.value = false;
    },
    { deep: true },
  );
}

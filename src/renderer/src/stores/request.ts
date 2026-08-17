import type {
  AuthConfig,
  HttpMethod,
  HttpRequestSpec,
  HttpResponseResult,
  KeyValueEntry,
  RequestBody,
  SaveFileResult,
} from "@shared";

import { suggestedFileName } from "@renderer/lib/content-type";
import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * A request sendo montada na UI (EP-03-T05). `headers`/`body`/`auth` já existem aqui
 * como campos editáveis — mesmo antes de T06 dar UI a eles — porque `HttpRequestSpec`
 * exige todos para disparar `http:send`; T06 só adiciona as abas que os editam.
 */
export const useRequestStore = defineStore("request", () => {
  const method = ref<HttpMethod>("GET");
  const url = ref("");
  const query = ref<KeyValueEntry[]>([]);
  const headers = ref<KeyValueEntry[]>([]);
  const body = ref<RequestBody>({ type: "none" });
  const auth = ref<AuthConfig>({ type: "none" });
  /** Anotação livre da request (docs/file-format.md §4) — não atravessa `http:send`. */
  const docs = ref("");

  const sending = ref(false);
  const requestId = ref<string | null>(null);
  const lastResult = ref<HttpResponseResult | null>(null);

  async function send(): Promise<void> {
    if (sending.value) return;

    const id = crypto.randomUUID();
    requestId.value = id;
    sending.value = true;

    try {
      const spec: HttpRequestSpec = {
        requestId: id,
        method: method.value,
        url: url.value,
        query: query.value,
        headers: headers.value,
        auth: auth.value,
        body: body.value,
      };
      lastResult.value = await window.wttp.http.send(spec);
    } finally {
      sending.value = false;
      requestId.value = null;
    }
  }

  function cancel(): void {
    if (!sending.value || !requestId.value) return;
    void window.wttp.http.cancel(requestId.value);
  }

  /** Salva o body da última resposta em disco, byte a byte (EP-03-T07). */
  async function saveResponseToFile(): Promise<SaveFileResult | null> {
    const result = lastResult.value;
    if (!result?.ok) return null;
    const contentType =
      result.headers.find(h => h.name.toLowerCase() === "content-type")?.value ?? "";
    return window.wttp.dialog.saveFile({
      data: result.body,
      suggestedName: suggestedFileName(contentType),
    });
  }

  return {
    method,
    url,
    query,
    headers,
    body,
    auth,
    docs,
    sending,
    lastResult,
    send,
    cancel,
    saveResponseToFile,
  };
});

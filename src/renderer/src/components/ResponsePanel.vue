<script setup lang="ts">
import type { HttpResponseResult } from "@shared";

import { isHtml, isImage, isPdf, isTextual } from "@renderer/lib/content-type";
import { parseSetCookieHeader } from "@renderer/lib/cookies";
import { formatBytes, formatDuration } from "@renderer/lib/format";
import { prettyPrintJson, prettyPrintMarkup } from "@renderer/lib/pretty-print";
import { describeRequestError } from "@renderer/lib/response-error";
import { useHistoryStore } from "@renderer/stores/history";
import { useRequestStore } from "@renderer/stores/request";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, ref, watch } from "vue";

import HistoryPanel from "./HistoryPanel.vue";
import ScriptResultsPanel from "./ScriptResultsPanel.vue";
import WButton from "./WButton.vue";
import WCodeEditor from "./WCodeEditor.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WSelect from "./WSelect.vue";
import WStatusBadge from "./WStatusBadge.vue";
import WTabs from "./WTabs.vue";

/**
 * Painel de resposta (EP-03-T07): status/tempo/tamanho, corpo (pretty/raw/preview),
 * headers e cookies. Lê `useRequestStore` direto — a mesma store que dispara
 * `http:send` (EP-03-T05) já guarda `lastResult` e `sending`, então não existe um
 * `useResponseStore` separado por enquanto.
 */

// Acima disso o texto não é decodificado/reformatado inteiro — só as respostas maiores
// que uma resposta de API típica pagam esse custo, e é o que evita travar a UI numa
// resposta de 20MB (EP-03-T07). Save sempre grava os bytes completos, truncados ou não.
const MAX_DISPLAY_BYTES = 2_000_000;

const store = useRequestStore();
const { sending, lastResult, scriptRun, path } = storeToRefs(store);

// --- History (EP-08.1-T04) ------------------------------------------------------------
const historyStore = useHistoryStore();
const { entries: historyEntries } = storeToRefs(historyStore);

watch(path, requestPath => void historyStore.loadFor(requestPath || null), { immediate: true });

// `dispatch()` (EP-08.1-T03) já gravou uma entrada nova quando o envio termina — recarrega
// para a aba History não ficar um envio atrasada.
watch(sending, (isSending, wasSending) => {
  if (wasSending && !isSending) void historyStore.loadFor(path.value || null);
});

/**
 * Fallback quando a aba não tem `lastResult` desta sessão (app reaberto): reconstrói um
 * `HttpResponseResult` a partir da entrada mais recente do histórico, pra Body/Headers/
 * Cookies abrirem já respondidos em vez de forçar passar pela aba History primeiro. O
 * corpo salvo em `.wttp/history/*.json` já é texto decodificado (e pode estar mascarado/
 * truncado, EP-08.1-T03) — reencodado em UTF-8, não no `charset` original.
 */
const historyAsResult = computed<HttpResponseResult | null>(() => {
  const entry = historyEntries.value[0];
  if (!entry) return null;
  if (!entry.response.ok) return { ok: false, requestId: "", error: entry.response.error };
  return {
    ok: true,
    requestId: "",
    status: entry.response.status,
    statusText: entry.response.statusText,
    headers: entry.response.headers,
    body: new TextEncoder().encode(entry.response.body),
    charset: "utf-8",
    size: entry.response.size,
    timing: entry.response.timing,
  };
});

/** `true` quando Body/Headers/Cookies estão mostrando o fallback do histórico, não uma resposta desta sessão. */
const isShowingHistoryFallback = computed(
  () => !lastResult.value && Boolean(historyAsResult.value),
);

const effectiveResult = computed(() => lastResult.value ?? historyAsResult.value);

const successResult = computed(() => (effectiveResult.value?.ok ? effectiveResult.value : null));
const failureResult = computed(() =>
  effectiveResult.value && !effectiveResult.value.ok ? effectiveResult.value : null,
);

function onClearHistory(): void {
  void historyStore.clear();
}

// --- Tests (EP-09-T05) ---------------------------------------------------------------
const scriptAssertions = computed(() => scriptRun.value?.assertions ?? []);
const scriptConsole = computed(() => scriptRun.value?.console ?? []);
const scriptPreRequestError = computed(() => scriptRun.value?.preRequestError);
const failedAssertionCount = computed(() => scriptAssertions.value.filter(a => !a.passed).length);
/** "Request sem scripts não exibe abas vazias" (EP-09-T05) — só aparece quando há algo pra mostrar. */
const hasScriptResults = computed(
  () =>
    scriptAssertions.value.length > 0 ||
    scriptConsole.value.length > 0 ||
    Boolean(scriptPreRequestError.value),
);

const contentType = computed(
  () =>
    successResult.value?.headers.find(h => h.name.toLowerCase() === "content-type")?.value ?? "",
);

const mainTab = ref<"body" | "headers" | "cookies" | "history" | "tests">("body");
const mainTabs = computed(() => {
  const tabs: { value: string; label: string; count?: number; warning?: boolean }[] = [];
  if (successResult.value) {
    tabs.push({ value: "body", label: "Body" });
    tabs.push({ value: "headers", label: "Headers", count: successResult.value.headers.length });
    tabs.push({ value: "cookies", label: "Cookies", count: cookies.value.length });
  }
  // Sempre presente — o ponto da aba History é justamente valer mesmo sem `lastResult`
  // desta sessão (app reaberto, EP-08.1-T01/T04).
  tabs.push({ value: "history", label: "History", count: historyEntries.value.length });
  if (hasScriptResults.value) {
    tabs.push({
      value: "tests",
      label: "Tests",
      count: scriptAssertions.value.length,
      warning: failedAssertionCount.value > 0,
    });
  }
  return tabs;
});

// Trocar de aba pode fazer a lista de tabs mudar por baixo (ex. sair de uma request com
// resposta pra uma sem) — nunca deixa `mainTab` apontando pra uma aba que sumiu.
watch(mainTabs, tabs => {
  if (tabs.length > 0 && !tabs.some(tab => tab.value === mainTab.value)) {
    mainTab.value = tabs[0].value as typeof mainTab.value;
  }
});

const bodyViewMode = ref<"pretty" | "raw" | "preview">("pretty");
const bodyViewOptions = computed(() => {
  const options = [
    { value: "pretty", label: "Pretty" },
    { value: "raw", label: "Raw" },
  ];
  if (isImage(contentType.value) || isHtml(contentType.value) || isPdf(contentType.value)) {
    options.push({ value: "preview", label: "Preview" });
  }
  return options;
});

// Toda vez que uma nova resposta chega, escolhe a melhor aba padrão para ela — uma
// imagem abre direto no Preview, o resto abre no Pretty. Também traz `mainTab` de volta
// pra Body: sem isso, mandar uma request enquanto a aba History estava selecionada (ex.
// request sem `lastResult` desta sessão, EP-08.1-T04) prendia a resposta nova atrás da
// aba errada — History continuava válida na lista, então o watcher de `mainTabs` não
// tinha motivo pra mexer nela.
watch(successResult, result => {
  if (!result) return;
  bodyViewMode.value =
    isImage(contentType.value) || isPdf(contentType.value) ? "preview" : "pretty";
  mainTab.value = "body";
});

const decodedBody = computed(() => {
  const result = successResult.value;
  if (!result) return { text: "", truncated: false };
  const bytes = result.body;
  const truncated = bytes.byteLength > MAX_DISPLAY_BYTES;
  const slice = truncated ? bytes.subarray(0, MAX_DISPLAY_BYTES) : bytes;
  let text: string;
  try {
    text = new TextDecoder(result.charset || "utf-8").decode(slice);
  } catch {
    text = new TextDecoder("utf-8").decode(slice);
  }
  return { text, truncated };
});

const editorLanguage = computed(() => {
  const type = contentType.value.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "application/json" || type.endsWith("+json")) return "json";
  if (type === "text/html") return "html";
  if (type === "application/xml" || type === "text/xml" || type.endsWith("+xml")) return "xml";
  if (type === "application/javascript" || type === "text/javascript") return "javascript";
  return "text";
});

const prettyBody = computed(() => {
  const { text } = decodedBody.value;
  if (editorLanguage.value === "json") return prettyPrintJson(text);
  if (editorLanguage.value === "html" || editorLanguage.value === "xml")
    return prettyPrintMarkup(text);
  return { text };
});

const displayText = computed(() =>
  bodyViewMode.value === "pretty" ? prettyBody.value.text : decodedBody.value.text,
);
const prettyWarning = computed(() =>
  bodyViewMode.value === "pretty" ? prettyBody.value.warning : undefined,
);

// URL de blob para preview de imagem/PDF — criada só quando precisa e revogada assim
// que troca ou o componente desmonta, para não vazar memória a cada resposta nova.
const previewUrl = ref("");

function revokePreviewUrl(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
}

watch(successResult, result => {
  revokePreviewUrl();
  if (!result) return;
  if (isImage(contentType.value) || isPdf(contentType.value)) {
    const blob = new Blob([result.body.slice()], { type: contentType.value || undefined });
    previewUrl.value = URL.createObjectURL(blob);
  }
});

onBeforeUnmount(revokePreviewUrl);

const cookies = computed(() => {
  const result = successResult.value;
  if (!result) return [];
  return result.headers
    .filter(h => h.name.toLowerCase() === "set-cookie")
    .map(h => parseSetCookieHeader(h.value));
});

const timingTitle = computed(() => {
  const timing = successResult.value?.timing;
  if (!timing) return "";
  return [
    `DNS: ${formatDuration(timing.dns)}`,
    `Connect: ${formatDuration(timing.connect)}`,
    `TLS: ${formatDuration(timing.tls)}`,
    `TTFB: ${formatDuration(timing.ttfb)}`,
    `Download: ${formatDuration(timing.download)}`,
    `Total: ${formatDuration(timing.total)}`,
  ].join("\n");
});

async function copyBody(): Promise<void> {
  await navigator.clipboard.writeText(decodedBody.value.text);
}

async function saveBody(): Promise<void> {
  await store.saveResponseToFile();
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      v-if="!sending && scriptPreRequestError"
      class="mx-2 mt-2 flex shrink-0 flex-col gap-1 rounded-md bg-status-5xx/10 px-3 py-2 font-inter text-sm text-status-5xx"
    >
      <p class="font-medium">
        Pre-request script failed ({{ scriptPreRequestError.source }}) — request not sent
      </p>
      <p class="font-mono text-xs">{{ scriptPreRequestError.error.message }}</p>
    </div>

    <WEmptyState
      v-if="!sending && !lastResult && historyEntries.length === 0"
      title="No response yet"
      description="Send a request to see the response here."
    >
      <template #icon>
        <WIcon name="inbox" size="5" />
      </template>
    </WEmptyState>

    <WEmptyState v-else-if="sending" title="Sending request…" description="Waiting for a response.">
      <template #icon>
        <WIcon name="loader-circle" size="5" class="animate-spin" />
      </template>
    </WEmptyState>

    <template v-else>
      <div
        v-if="successResult"
        class="flex h-9 shrink-0 items-center gap-4 border-b border-subtle px-3"
      >
        <WStatusBadge :code="successResult.status" />
        <span class="font-mono text-[13px] text-muted" :title="timingTitle">
          {{ formatDuration(successResult.timing.total) }}
        </span>
        <span class="font-mono text-[13px] text-muted">
          {{ formatBytes(successResult.size.bodyReceived) }}
        </span>
        <span
          v-if="isShowingHistoryFallback"
          class="flex items-center gap-1 font-inter text-[11px] text-faint"
          title="No response sent this session yet — showing the last one from history."
        >
          <WIcon name="history" size="3" />
          Last response
        </span>
        <div class="ml-auto flex items-center gap-2">
          <WButton size="sm" variant="ghost" @click="copyBody">Copy</WButton>
          <WButton v-if="!isShowingHistoryFallback" size="sm" variant="ghost" @click="saveBody">
            Save
          </WButton>
        </div>
      </div>

      <div
        v-else-if="failureResult"
        class="flex shrink-0 flex-col items-center justify-center gap-2 p-6 text-center"
      >
        <WStatusBadge :code="null" />
        <p class="font-barlow text-base font-semibold text-1">{{ failureResult.error.code }}</p>
        <p class="max-w-md font-inter text-sm text-muted">
          {{ describeRequestError(failureResult.error.code) }}
        </p>
        <p v-if="failureResult.error.detail" class="font-mono text-xs text-faint">
          {{ failureResult.error.detail }}
        </p>
        <p
          v-if="isShowingHistoryFallback"
          class="flex items-center gap-1 font-inter text-[11px] text-faint"
        >
          <WIcon name="history" size="3" />
          No response sent this session yet — showing the last one from history.
        </p>
      </div>

      <p v-else class="shrink-0 px-3 py-2 font-inter text-xs text-muted">
        No response yet this session — showing history from before.
      </p>

      <WTabs v-model="mainTab" :tabs="mainTabs" />

      <div
        v-if="mainTab === 'body' && successResult"
        class="flex min-h-0 flex-1 flex-col gap-2 pt-2"
      >
        <div class="w-32">
          <WSelect v-model="bodyViewMode" :options="bodyViewOptions" />
        </div>

        <p
          v-if="prettyWarning"
          class="rounded-md bg-status-4xx/10 px-2 py-1 font-inter text-xs text-status-4xx"
        >
          {{ prettyWarning }}
        </p>
        <p
          v-if="decodedBody.truncated && bodyViewMode !== 'preview'"
          class="rounded-md bg-status-3xx/10 px-2 py-1 font-inter text-xs text-status-3xx"
        >
          Showing the first {{ formatBytes(MAX_DISPLAY_BYTES) }} of
          {{ formatBytes(successResult.size.bodyReceived) }} — use Save to get the full response.
        </p>

        <div v-if="bodyViewMode === 'preview'" class="min-h-0 flex-1 overflow-auto bg-surface-1">
          <img
            v-if="isImage(contentType)"
            :src="previewUrl"
            class="mx-auto max-w-full"
            alt="Response preview"
          />
          <iframe
            v-else-if="isHtml(contentType)"
            :srcdoc="decodedBody.text"
            sandbox=""
            class="size-full border-0 bg-white"
            title="Response HTML preview"
          />
          <embed
            v-else-if="isPdf(contentType)"
            :src="previewUrl"
            type="application/pdf"
            class="size-full"
          />
        </div>

        <div v-else class="min-h-0 flex-1">
          <WCodeEditor
            v-if="isTextual(contentType)"
            :model-value="displayText"
            :language="editorLanguage"
            read-only
            line-wrap
          />
          <WEmptyState
            v-else
            title="Binary content"
            description="This response isn't text — use Save to write it to a file."
          >
            <template #icon>
              <WIcon name="file-box" size="5" />
            </template>
          </WEmptyState>
        </div>
      </div>

      <div
        v-else-if="mainTab === 'headers' && successResult"
        class="min-h-0 flex-1 overflow-y-auto pt-2"
      >
        <div
          v-for="(header, index) in successResult.headers"
          :key="index"
          class="flex h-7 items-center gap-2 border-b border-subtle px-2 font-mono text-[13px] last:border-b-0"
        >
          <span class="w-1/3 shrink-0 truncate text-1">{{ header.name }}</span>
          <span class="flex-1 truncate text-muted">{{ header.value }}</span>
        </div>
      </div>

      <HistoryPanel
        v-else-if="mainTab === 'history'"
        :entries="historyEntries"
        @clear="onClearHistory"
      />

      <ScriptResultsPanel
        v-else-if="mainTab === 'tests'"
        :assertions="scriptAssertions"
        :console-entries="scriptConsole"
        :pre-request-error="scriptPreRequestError"
      />

      <div
        v-else-if="mainTab === 'cookies' && successResult"
        class="min-h-0 flex-1 overflow-y-auto pt-2"
      >
        <WEmptyState
          v-if="cookies.length === 0"
          title="No cookies"
          description="This response set no cookies."
        >
          <template #icon>
            <WIcon name="cookie" size="5" />
          </template>
        </WEmptyState>
        <div v-else class="flex flex-col">
          <div
            v-for="(cookie, index) in cookies"
            :key="index"
            class="flex h-7 items-center gap-2 border-b border-subtle px-2 font-mono text-[13px] last:border-b-0"
          >
            <span class="w-1/3 shrink-0 truncate text-1">{{ cookie.name }}</span>
            <span class="flex-1 truncate text-muted">{{ cookie.value }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

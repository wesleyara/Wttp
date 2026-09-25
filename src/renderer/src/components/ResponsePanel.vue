<script setup lang="ts">
import type { HttpResponseResult } from "@shared";

import { useJsonPathFilter } from "@renderer/composables/useJsonPathFilter";
import { isHtml, isImage, isPdf, isTextual } from "@renderer/lib/content-type";
import { parseSetCookieHeader } from "@renderer/lib/cookies";
import { formatBytes, formatDuration } from "@renderer/lib/format";
import { prettyPrintJson, prettyPrintMarkup } from "@renderer/lib/pretty-print";
import { describeRequestError } from "@renderer/lib/response-error";
import { useHistoryStore } from "@renderer/stores/history";
import { useRequestStore } from "@renderer/stores/request";
import { useUiStore } from "@renderer/stores/ui";
import { storeToRefs } from "pinia";
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

import HistoryPanel from "./HistoryPanel.vue";
import ResponseJsonTree from "./ResponseJsonTree.vue";
import ResponseStatusBar from "./ResponseStatusBar.vue";
import ScriptResultsPanel from "./ScriptResultsPanel.vue";
import WButton from "./WButton.vue";
import WCodeEditor from "./WCodeEditor.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WInput from "./WInput.vue";
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

const { t } = useI18n();
const store = useRequestStore();
const { sending, lastResult, scriptRun, path } = storeToRefs(store);

// --- Layout (EP-08.1-T05) --------------------------------------------------------------
// Lateralizado dá pouca largura ao painel de resposta — status/tempo/tamanho/Copy/Save
// não cabem na mesma linha das tabs sem forçar scroll horizontal nelas. Só nesse modo o
// bloco volta a ficar numa linha própria acima das tabs; embaixo (largura cheia) cabe
// tudo numa linha só.
const ui = useUiStore();
const statusBarStacked = computed(() => ui.responsePanelPosition === "side");

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

/**
 * Declarado antes de `mainTabs`, que a referencia — `watch()` (abaixo) roda o getter de
 * `mainTabs` de forma síncrona já na configuração do componente para capturar o valor
 * inicial, mesmo sem `immediate: true`; se `cookies` viesse depois, isso era um TDZ
 * (`Cannot access 'cookies' before initialization`) toda vez que o painel remonta com uma
 * resposta já disponível (ex. troca de posição do painel via `ui.responsePanelPosition`).
 */
const cookies = computed(() => {
  const result = successResult.value;
  if (!result) return [];
  return result.headers
    .filter(h => h.name.toLowerCase() === "set-cookie")
    .map(h => parseSetCookieHeader(h.value));
});

const mainTab = ref<"error" | "body" | "headers" | "cookies" | "history" | "tests">(
  failureResult.value ? "error" : "body",
);
const mainTabs = computed(() => {
  const tabs: { value: string; label: string; count?: number; warning?: boolean }[] = [];
  // O erro é conteúdo de uma aba, não um bloco fixo acima delas — antes ele ficava
  // visível em qualquer aba (inclusive History, dividindo a tela com a lista) e sobrevivia
  // a "Limpar histórico" (card 41).
  if (failureResult.value) {
    tabs.push({ value: "error", label: t("response.tabs.error"), warning: true });
  }
  if (successResult.value) {
    tabs.push({ value: "body", label: t("response.tabs.body") });
    tabs.push({
      value: "headers",
      label: t("response.tabs.headers"),
      count: successResult.value.headers.length,
    });
    tabs.push({ value: "cookies", label: t("response.tabs.cookies"), count: cookies.value.length });
  }
  // Sempre presente — o ponto da aba History é justamente valer mesmo sem `lastResult`
  // desta sessão (app reaberto, EP-08.1-T01/T04).
  tabs.push({
    value: "history",
    label: t("response.tabs.history"),
    count: historyEntries.value.length,
  });
  if (hasScriptResults.value) {
    tabs.push({
      value: "tests",
      label: t("response.tabs.tests"),
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

// Uma falha nova (ou a do histórico ao reabrir o app) abre direto na aba Erro — pelo mesmo
// motivo do watcher de `successResult` abaixo: sem isso ela ficaria atrás da aba History.
watch(failureResult, result => {
  if (result) mainTab.value = "error";
});

const bodyViewMode = ref<"pretty" | "raw" | "preview" | "tree">("pretty");
const bodyViewOptions = computed(() => {
  const options = [
    { value: "pretty", label: t("response.view.pretty") },
    { value: "raw", label: t("response.view.raw") },
  ];
  if (isImage(contentType.value) || isHtml(contentType.value) || isPdf(contentType.value)) {
    options.push({ value: "preview", label: t("response.view.preview") });
  }
  if (editorLanguage.value === "json") {
    options.push({ value: "tree", label: t("response.view.tree") });
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

/**
 * Documento da árvore clicável (#47): parseia o corpo inteiro, não o `decodedBody`
 * truncado em 2MB — `JSON.parse` de alguns MB é rápido; o custo de UI é da árvore, que
 * só monta as linhas visíveis. Só roda com a visão Tree aberta.
 */
const treeDocument = computed(() => {
  const result = successResult.value;
  if (bodyViewMode.value !== "tree" || !result || editorLanguage.value !== "json") return null;
  try {
    return { data: JSON.parse(new TextDecoder(result.charset || "utf-8").decode(result.body)) };
  } catch {
    return { data: undefined };
  }
});

const prettyBody = computed(() => {
  const { text } = decodedBody.value;
  if (editorLanguage.value === "json") return prettyPrintJson(text);
  if (editorLanguage.value === "html" || editorLanguage.value === "xml")
    return prettyPrintMarkup(text);
  return { text };
});

// --- Filtro JSONPath (ClickLocal #48) ---------------------------------------------------
// Só para body JSON; o body original nunca muda — o filtro troca só o que o editor mostra,
// e limpar volta ao body inteiro. Aberto sozinho quando a request já tem filtro guardado.
const isJsonBody = computed(() => editorLanguage.value === "json");
const { expression: filterExpression, result: filterResult } = useJsonPathFilter(
  path,
  computed(() => decodedBody.value.text),
  isJsonBody,
);
const filterOpen = ref(false);
const filterRow = useTemplateRef<HTMLElement>("filterRow");

watch(
  [path, () => filterExpression.value !== ""],
  () => {
    if (filterExpression.value) filterOpen.value = true;
  },
  { immediate: true },
);
watch(path, () => {
  filterOpen.value = filterExpression.value !== "";
});

async function openFilter(): Promise<void> {
  if (!isJsonBody.value) return;
  filterOpen.value = true;
  await nextTick();
  filterRow.value?.querySelector("input")?.focus();
}

function closeFilter(): void {
  filterExpression.value = "";
  filterOpen.value = false;
}

/** Ctrl/Cmd+F com o foco no body abre o filtro — em captura, antes da busca do CodeMirror. */
function onBodyKeydown(event: KeyboardEvent): void {
  if (!isJsonBody.value || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  void openFilter();
}

const filterMatchesLabel = computed(() => {
  const result = filterResult.value;
  if (result.kind !== "ok") return "";
  return result.count === 1
    ? t("response.filter.matchesOne")
    : t("response.filter.matchesOther", { count: result.count });
});

const filterErrorMessage = computed(() => {
  const result = filterResult.value;
  if (result.kind === "syntaxError") {
    return t("response.filter.syntaxError", {
      position: result.position + 1,
      message: result.message,
    });
  }
  if (result.kind === "invalidJson") return t("response.filter.invalidJson");
  return "";
});

const displayText = computed(() => {
  if (filterResult.value.kind === "ok") return filterResult.value.text;
  return bodyViewMode.value === "pretty" ? prettyBody.value.text : decodedBody.value.text;
});
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

const timingTitle = computed(() => {
  const timing = successResult.value?.timing;
  if (!timing) return "";
  return [
    t("response.timing.dns", { value: formatDuration(timing.dns) }),
    t("response.timing.connect", { value: formatDuration(timing.connect) }),
    t("response.timing.tls", { value: formatDuration(timing.tls) }),
    t("response.timing.ttfb", { value: formatDuration(timing.ttfb) }),
    t("response.timing.download", { value: formatDuration(timing.download) }),
    t("response.timing.total", { value: formatDuration(timing.total) }),
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
        {{ t("response.preRequestFailed", { source: scriptPreRequestError.source }) }}
      </p>
      <p class="font-mono text-xs">{{ scriptPreRequestError.error.message }}</p>
    </div>

    <WEmptyState
      v-if="!sending && !lastResult && historyEntries.length === 0"
      :title="t('response.empty.title')"
      :description="t('response.empty.description')"
    >
      <template #icon>
        <WIcon name="inbox" size="5" />
      </template>
    </WEmptyState>

    <WEmptyState
      v-else-if="sending"
      :title="t('response.sending.title')"
      :description="t('response.sending.description')"
    >
      <template #icon>
        <WIcon name="loader-circle" size="5" class="animate-spin" />
      </template>
    </WEmptyState>

    <template v-else>
      <div
        v-if="successResult && statusBarStacked"
        class="flex h-9 shrink-0 items-center gap-4 border-b border-subtle px-3"
      >
        <ResponseStatusBar
          :status="successResult.status"
          :timing-total="successResult.timing.total"
          :timing-title="timingTitle"
          :body-size="successResult.size.bodyReceived"
          :is-showing-history-fallback="isShowingHistoryFallback"
          @copy="copyBody"
          @save="saveBody"
        />
      </div>

      <WTabs v-model="mainTab" class="pt-1.5" :tabs="mainTabs">
        <template v-if="successResult && !statusBarStacked" #actions>
          <ResponseStatusBar
            :status="successResult.status"
            :timing-total="successResult.timing.total"
            :timing-title="timingTitle"
            :body-size="successResult.size.bodyReceived"
            :is-showing-history-fallback="isShowingHistoryFallback"
            @copy="copyBody"
            @save="saveBody"
          />
        </template>
      </WTabs>

      <div
        v-if="mainTab === 'error' && failureResult"
        class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto p-6 text-center"
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
          {{ t("response.historyFallback") }}
        </p>
      </div>

      <div
        v-else-if="mainTab === 'body' && successResult"
        class="flex min-h-0 flex-1 flex-col gap-2 pt-2"
        @keydown.capture="onBodyKeydown"
      >
        <div class="flex items-center gap-2">
          <div class="w-32">
            <WSelect v-model="bodyViewMode" :options="bodyViewOptions" />
          </div>
          <span
            v-if="bodyViewMode !== 'preview' && bodyViewMode !== 'tree'"
            :title="isJsonBody ? t('response.filter.open') : t('response.filter.jsonOnly')"
          >
            <WButton
              size="sm"
              variant="ghost"
              :disabled="!isJsonBody"
              :aria-label="t('response.filter.open')"
              :aria-pressed="filterOpen"
              :class="filterOpen ? 'text-accent' : ''"
              data-testid="response-filter-toggle"
              @click="filterOpen ? closeFilter() : openFilter()"
            >
              <WIcon name="funnel" />
            </WButton>
          </span>
        </div>

        <div
          v-if="filterOpen && isJsonBody && bodyViewMode !== 'preview' && bodyViewMode !== 'tree'"
          ref="filterRow"
          class="flex flex-col gap-1"
          @keydown.esc.stop="closeFilter"
        >
          <WInput
            v-model="filterExpression"
            :placeholder="t('response.filter.placeholder')"
            :error="filterErrorMessage !== ''"
            monospace
            data-testid="response-filter-input"
          >
            <template #prefix>
              <WIcon name="funnel" class="text-faint" />
            </template>
            <template #suffix>
              <span
                v-if="filterMatchesLabel"
                class="shrink-0 whitespace-nowrap font-inter text-[11px] text-faint"
              >
                {{ filterMatchesLabel }}
              </span>
              <button
                type="button"
                class="flex size-5 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1"
                :title="t('response.filter.clear')"
                :aria-label="t('response.filter.clear')"
                @click="closeFilter"
              >
                <WIcon name="x" size="3" />
              </button>
            </template>
          </WInput>
          <p
            v-if="filterErrorMessage"
            class="font-inter text-xs text-status-5xx"
            data-testid="response-filter-error"
          >
            {{ filterErrorMessage }}
          </p>
        </div>

        <p
          v-if="prettyWarning"
          class="rounded-md bg-status-4xx/10 px-2 py-1 font-inter text-xs text-status-4xx"
        >
          {{ prettyWarning }}
        </p>
        <p
          v-if="decodedBody.truncated && bodyViewMode !== 'preview' && bodyViewMode !== 'tree'"
          class="rounded-md bg-status-3xx/10 px-2 py-1 font-inter text-xs text-status-3xx"
        >
          {{
            t("response.truncated", {
              shown: formatBytes(MAX_DISPLAY_BYTES),
              total: formatBytes(successResult.size.bodyReceived),
            })
          }}
        </p>

        <div v-if="bodyViewMode === 'preview'" class="min-h-0 flex-1 overflow-auto bg-surface-1">
          <img
            v-if="isImage(contentType)"
            :src="previewUrl"
            class="mx-auto max-w-full"
            :alt="t('response.previewAlt')"
          />
          <iframe
            v-else-if="isHtml(contentType)"
            :srcdoc="decodedBody.text"
            sandbox=""
            class="size-full border-0 bg-white"
            :title="t('response.htmlPreviewTitle')"
          />
          <embed
            v-else-if="isPdf(contentType)"
            :src="previewUrl"
            type="application/pdf"
            class="size-full"
          />
        </div>

        <div v-else-if="bodyViewMode === 'tree'" class="min-h-0 flex-1">
          <ResponseJsonTree v-if="treeDocument?.data !== undefined" :data="treeDocument.data" />
          <p v-else class="px-2 font-inter text-sm text-muted">{{ t("response.tree.invalid") }}</p>
        </div>

        <div v-else class="min-h-0 flex-1">
          <WCodeEditor
            v-if="isTextual(contentType)"
            :model-value="displayText"
            data-testid="response-body-viewer"
            :language="editorLanguage"
            read-only
            line-wrap
          />
          <WEmptyState
            v-else
            :title="t('response.binary.title')"
            :description="t('response.binary.description')"
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
          :title="t('response.noCookies.title')"
          :description="t('response.noCookies.description')"
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

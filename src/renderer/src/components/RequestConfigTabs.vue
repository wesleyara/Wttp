<script setup lang="ts">
import type { MultipartEntry, RequestBody } from "@shared";

import { useKeyValueRows } from "@renderer/composables/useKeyValueRows";
import { useRequestStore } from "@renderer/stores/request";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";

import type { KeyValueRow } from "./WKeyValueTable.vue";

import WCodeEditor from "./WCodeEditor.vue";
import WEmptyState from "./WEmptyState.vue";
import WInput from "./WInput.vue";
import WKeyValueTable from "./WKeyValueTable.vue";
import WSelect from "./WSelect.vue";
import WTabs from "./WTabs.vue";

const store = useRequestStore();
const { query, headers, body, docs } = storeToRefs(store);

const activeTab = ref("params");

function countActive(rows: { enabled: boolean; name: string }[]): number {
  return rows.filter(row => row.enabled && row.name !== "").length;
}

const bodyCount = computed(() => {
  const b = body.value;
  if (b.type === "none") return 0;
  if (b.type === "urlencoded") return countActive(b.urlencoded);
  if (b.type === "multipart") return countActive(b.multipart);
  if (b.type === "json") return b.json.trim() === "" ? 0 : 1;
  if (b.type === "raw") return b.raw.trim() === "" ? 0 : 1;
  if (b.type === "binary") return b.binary.trim() === "" ? 0 : 1;
  return 0;
});

const tabs = computed(() => [
  { value: "params", label: "Params", count: countActive(query.value) },
  { value: "headers", label: "Headers", count: countActive(headers.value) },
  { value: "body", label: "Body", count: bodyCount.value },
  { value: "auth", label: "Auth" },
  { value: "scripts", label: "Scripts" },
  { value: "docs", label: "Docs" },
]);

const queryRows = useKeyValueRows(query);
const headerRows = useKeyValueRows(headers);

// --- Body: seletor de tipo, preservando o conteúdo dos outros ao trocar -----------

const BODY_TYPE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "json", label: "JSON" },
  { value: "urlencoded", label: "URL Encoded" },
  { value: "raw", label: "Raw" },
  { value: "multipart", label: "Multipart" },
  { value: "binary", label: "Binary" },
] as const;

function defaultBodyFor(type: RequestBody["type"]): RequestBody {
  switch (type) {
    case "none":
      return { type: "none" };
    case "json":
      return { type: "json", json: "" };
    case "urlencoded":
      return { type: "urlencoded", urlencoded: [] };
    case "raw":
      return { type: "raw", raw: "", contentType: "text/plain" };
    case "multipart":
      return { type: "multipart", multipart: [] };
    case "binary":
      return { type: "binary", binary: "" };
  }
}

// Um rascunho por tipo, vivo enquanto o componente existir — trocar de "json" para
// "raw" e voltar para "json" devolve exatamente o que estava lá, não um campo em branco.
const bodyDrafts = new Map<RequestBody["type"], RequestBody>();

const bodyType = computed<RequestBody["type"]>({
  get: () => body.value.type,
  set: nextType => {
    bodyDrafts.set(body.value.type, body.value);
    body.value = bodyDrafts.get(nextType) ?? defaultBodyFor(nextType);
  },
});

const jsonContent = computed<string>({
  get: () => (body.value.type === "json" ? body.value.json : ""),
  set: value => {
    body.value = { type: "json", json: value };
  },
});

const rawContent = computed<string>({
  get: () => (body.value.type === "raw" ? body.value.raw : ""),
  set: value => {
    if (body.value.type !== "raw") return;
    body.value = { ...body.value, raw: value };
  },
});

const rawContentType = computed<string>({
  get: () => (body.value.type === "raw" ? body.value.contentType : ""),
  set: value => {
    if (body.value.type !== "raw") return;
    body.value = { ...body.value, contentType: value };
  },
});

const urlencodedRows = computed<KeyValueRow[]>({
  get: () =>
    body.value.type === "urlencoded"
      ? body.value.urlencoded.map(row => ({ ...row, description: row.description ?? "" }))
      : [],
  set: rows => {
    if (body.value.type !== "urlencoded") return;
    body.value = { type: "urlencoded", urlencoded: rows };
  },
});

const binaryPath = computed<string>({
  get: () => (body.value.type === "binary" ? body.value.binary : ""),
  set: value => {
    body.value = { type: "binary", binary: value };
  },
});

const multipartEntries = computed<MultipartEntry[]>({
  get: () => (body.value.type === "multipart" ? body.value.multipart : []),
  set: entries => {
    body.value = { type: "multipart", multipart: entries };
  },
});

function blankMultipartRow(): MultipartEntry {
  return { name: "", type: "text", value: "", enabled: true };
}

const multipartDisplayRows = computed(() => [...multipartEntries.value, blankMultipartRow()]);

function updateMultipartRow(index: number, patch: Partial<MultipartEntry>): void {
  const next = [...multipartEntries.value];
  if (index === multipartEntries.value.length) next.push({ ...blankMultipartRow(), ...patch });
  else next[index] = { ...next[index], ...patch };
  multipartEntries.value = next;
}

function removeMultipartRow(index: number): void {
  multipartEntries.value = multipartEntries.value.filter((_, i) => i !== index);
}

// --- Content-Type sugerido a partir do tipo de body, sobrescritível à mão ---------

const AUTO_CONTENT_TYPE: Partial<Record<RequestBody["type"], string>> = {
  json: "application/json",
  urlencoded: "application/x-www-form-urlencoded",
  binary: "application/octet-stream",
};

const suggestedContentType = computed(() => {
  const b = body.value;
  if (b.type === "raw") return b.contentType || undefined;
  return AUTO_CONTENT_TYPE[b.type];
});

let applyingAutoContentType = false;
const contentTypeIsAuto = ref(true);

function findContentTypeIndex(rows: { name: string }[]): number {
  return rows.findIndex(row => row.name.toLowerCase() === "content-type");
}

watch(suggestedContentType, suggestion => {
  if (!suggestion || !contentTypeIsAuto.value) return;
  applyingAutoContentType = true;
  const next = [...headers.value];
  const index = findContentTypeIndex(next);
  const row = { name: "Content-Type", value: suggestion, enabled: true, description: "" };
  if (index === -1) next.push(row);
  else next[index] = row;
  headers.value = next;
  applyingAutoContentType = false;
});

watch(
  headers,
  next => {
    if (applyingAutoContentType) return;
    const index = findContentTypeIndex(next);
    if (index === -1) {
      // Linha apagada à mão: volta a aceitar sugestão automática.
      contentTypeIsAuto.value = true;
      return;
    }
    if (next[index].value !== suggestedContentType.value) contentTypeIsAuto.value = false;
  },
  { deep: true },
);
</script>

<template>
  <div class="flex flex-col">
    <WTabs v-model="activeTab" :tabs="tabs" />

    <div v-if="activeTab === 'params'" class="pt-2">
      <WKeyValueTable v-model="queryRows" />
    </div>

    <div v-else-if="activeTab === 'headers'" class="pt-2">
      <WKeyValueTable v-model="headerRows" />
    </div>

    <div v-else-if="activeTab === 'body'" class="flex flex-col gap-2 pt-2">
      <div class="flex items-center gap-2">
        <div class="w-40">
          <WSelect v-model="bodyType" :options="[...BODY_TYPE_OPTIONS]" />
        </div>
        <div v-if="bodyType === 'raw'" class="flex-1">
          <WInput v-model="rawContentType" placeholder="Content-Type (ex: text/xml)" monospace />
        </div>
        <div v-if="bodyType === 'binary'" class="flex-1">
          <WInput
            v-model="binaryPath"
            placeholder="Path relative to the workspace root"
            monospace
          />
        </div>
      </div>

      <WEmptyState
        v-if="bodyType === 'none'"
        title="No body"
        description="This request has no body."
      />

      <div v-else-if="bodyType === 'json'" class="h-48">
        <WCodeEditor v-model="jsonContent" language="json" placeholder='{"key": "value"}' />
      </div>

      <div v-else-if="bodyType === 'raw'" class="h-48">
        <WCodeEditor v-model="rawContent" language="text" />
      </div>

      <WKeyValueTable v-else-if="bodyType === 'urlencoded'" v-model="urlencodedRows" />

      <div v-else-if="bodyType === 'multipart'" class="flex flex-col">
        <div
          class="flex h-7 items-center gap-2 border-b border-subtle px-2 font-inter text-xs font-medium text-faint"
        >
          <span class="w-5 shrink-0" />
          <span class="w-1/4 shrink-0">Name</span>
          <span class="w-20 shrink-0">Type</span>
          <span class="flex-1">Value</span>
          <span class="w-6 shrink-0" />
        </div>
        <div
          v-for="(row, index) in multipartDisplayRows"
          :key="index"
          class="flex h-7 items-center gap-2 border-b border-subtle px-2 last:border-b-0"
        >
          <input
            type="checkbox"
            :checked="row.enabled"
            class="size-3.5 shrink-0 accent-accent"
            :aria-label="`Enable row ${index + 1}`"
            @change="
              updateMultipartRow(index, { enabled: ($event.target as HTMLInputElement).checked })
            "
          />
          <input
            :value="row.name"
            placeholder="Name"
            class="w-1/4 shrink-0 bg-transparent font-mono text-[13px] text-1 outline-none placeholder:text-faint"
            @input="updateMultipartRow(index, { name: ($event.target as HTMLInputElement).value })"
          />
          <select
            :value="row.type"
            class="w-20 shrink-0 bg-transparent font-inter text-xs text-1 outline-none"
            @change="
              updateMultipartRow(index, {
                type: ($event.target as HTMLSelectElement).value as 'text' | 'file',
              })
            "
          >
            <option value="text">Text</option>
            <option value="file">File</option>
          </select>
          <input
            :value="row.value"
            :placeholder="row.type === 'file' ? 'Path relative to the workspace root' : 'Value'"
            class="flex-1 bg-transparent font-mono text-[13px] text-1 outline-none placeholder:text-faint"
            @input="updateMultipartRow(index, { value: ($event.target as HTMLInputElement).value })"
          />
          <button
            v-if="index < multipartEntries.length"
            type="button"
            aria-label="Remove row"
            class="flex size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            @click="removeMultipartRow(index)"
          >
            <svg class="size-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <span v-else class="w-6 shrink-0" />
        </div>
      </div>

      <div v-else-if="bodyType === 'binary'" class="p-2 font-inter text-sm text-muted">
        The file at the path above is read and sent as the request body.
      </div>
    </div>

    <div v-else-if="activeTab === 'auth'" class="pt-2">
      <WEmptyState
        title="No auth configured"
        description="Bearer, Basic and API key auth are coming in a future release."
      />
    </div>

    <div v-else-if="activeTab === 'scripts'" class="pt-2">
      <WEmptyState
        title="No scripts"
        description="Pre-request and test scripts are coming in a future release."
      />
    </div>

    <div v-else-if="activeTab === 'docs'" class="h-40 pt-2">
      <WCodeEditor v-model="docs" language="text" placeholder="Document this request…" />
    </div>
  </div>
</template>

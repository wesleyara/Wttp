<script setup lang="ts">
import type { MultipartEntry, RequestBody } from "@shared";

import { useAutoContentType } from "@renderer/composables/useAutoContentType";
import { useEffectiveAuth } from "@renderer/composables/useEffectiveAuth";
import { useKeyValueRows } from "@renderer/composables/useKeyValueRows";
import { useVariablePreview } from "@renderer/composables/useVariablePreview";
import { useRequestStore } from "@renderer/stores/request";
import { useVariablesStore } from "@renderer/stores/variables";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";

import type { KeyValueRow } from "./WKeyValueTable.vue";

import AuthConfigEditor from "./AuthConfigEditor.vue";
import WCodeEditor from "./WCodeEditor.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WInput from "./WInput.vue";
import WKeyValueTable from "./WKeyValueTable.vue";
import WSelect from "./WSelect.vue";
import WTabs from "./WTabs.vue";

const store = useRequestStore();
const { pathParams, query, headers, body, auth, docs, path } = storeToRefs(store);
const variablesStore = useVariablesStore();

const activeTab = ref("params");

// Realce/tooltip/autocomplete de `{{var}}` no body (EP-06-T05) — só o body passa por
// CodeMirror hoje; params/headers usam `WKeyValueTable`, que já ganhou o tratamento
// visual mais simples (borda/tooltip agregados) na mesma task.
const bodyText = computed(() => {
  const b = body.value;
  if (b.type === "json") return b.json;
  if (b.type === "raw") return b.raw;
  return "";
});
const { unresolved: bodyUnresolved, tooltips: bodyTooltips } = useVariablePreview(bodyText, path);
const variableNames = computed(() => variablesStore.variableNamesFor(path.value));

const pathParamsText = computed(() => pathParams.value.map(row => row.value).join("\n"));
const { unresolved: pathParamsUnresolved, tooltips: pathParamsTooltips } = useVariablePreview(
  pathParamsText,
  path,
);

const queryText = computed(() => query.value.map(row => row.value).join("\n"));
const { unresolved: queryUnresolved, tooltips: queryTooltips } = useVariablePreview(
  queryText,
  path,
);

const headersText = computed(() => headers.value.map(row => row.value).join("\n"));
const { unresolved: headersUnresolved, tooltips: headersTooltips } = useVariablePreview(
  headersText,
  path,
);

const urlencodedText = computed(() =>
  body.value.type === "urlencoded" ? body.value.urlencoded.map(row => row.value).join("\n") : "",
);
const { unresolved: urlencodedUnresolved, tooltips: urlencodedTooltips } = useVariablePreview(
  urlencodedText,
  path,
);

const multipartText = computed(() =>
  body.value.type === "multipart"
    ? body.value.multipart
        .filter(row => row.type === "text")
        .map(row => row.value)
        .join("\n")
    : "",
);
const { unresolved: multipartUnresolved, tooltips: multipartTooltips } = useVariablePreview(
  multipartText,
  path,
);

const { unresolved: docsUnresolved, tooltips: docsTooltips } = useVariablePreview(docs, path);

// --- Scripts (EP-09-T04) ------------------------------------------------------------
const { scripts } = storeToRefs(store);
const scriptsSubTab = ref<"preRequest" | "tests">("preRequest");

const preRequestScript = computed<string>({
  get: () => scripts.value.preRequest ?? "",
  set: value => {
    scripts.value = { ...scripts.value, preRequest: value };
  },
});

const testsScript = computed<string>({
  get: () => scripts.value.tests ?? "",
  set: value => {
    scripts.value = { ...scripts.value, tests: value };
  },
});

const hasScripts = computed(
  () => Boolean(scripts.value.preRequest?.trim()) || Boolean(scripts.value.tests?.trim()),
);

// --- Auth (EP-07-T03/T04): badge/aviso na própria WTabs, sem precisar abrir a aba ---
const selfLabel = computed(() => "This request");
const { effective: effectiveAuth, inherited: authInherited } = useEffectiveAuth(
  auth,
  path,
  selfLabel,
);

const effectiveAuthLabel = computed(() => {
  switch (effectiveAuth.value.type) {
    case "bearer":
      return "Bearer";
    case "basic":
      return "Basic";
    case "apikey":
      return "API Key";
    default:
      return null;
  }
});

const authBadge = computed(() => {
  if (!effectiveAuthLabel.value) return undefined;
  return authInherited.value ? `${effectiveAuthLabel.value} ↑` : effectiveAuthLabel.value;
});

/** Texto com os campos de texto da auth *efetiva* (já com a herança resolvida) — uma variável não resolvida numa pasta herdada precisa avisar aqui tanto quanto uma da própria request. */
const effectiveAuthText = computed(() => {
  const value = effectiveAuth.value;
  if (value.type === "bearer") return value.bearer.token;
  if (value.type === "basic") return `${value.basic.username}\n${value.basic.password}`;
  if (value.type === "apikey") return `${value.apikey.key}\n${value.apikey.value}`;
  return "";
});
const { unresolved: authUnresolved } = useVariablePreview(effectiveAuthText, path);

function unresolvedNamesIn(names: string[], value: string): string[] {
  return names.filter(name => new RegExp(`\\{\\{\\s*${escapeRegExp(name)}\\s*\\}\\}`).test(value));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function multipartRowTooltip(value: string): string | undefined {
  const names = unresolvedNamesIn(multipartUnresolved.value, value);
  if (names.length === 0) return undefined;
  return names.map(name => multipartTooltips.value[name] ?? `${name} — not resolved`).join("\n");
}

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
  {
    value: "params",
    label: "Params",
    count: countActive(query.value) + countActive(pathParams.value),
  },
  { value: "headers", label: "Headers", count: countActive(headers.value) },
  { value: "body", label: "Body", count: bodyCount.value },
  {
    value: "auth",
    label: "Auth",
    badge: authBadge.value,
    warning: authUnresolved.value.length > 0,
  },
  {
    value: "scripts",
    label: "Scripts",
    badge: hasScripts.value ? "●" : undefined,
    warning: Boolean(store.scriptRun?.preRequestError),
  },
  { value: "docs", label: "Docs" },
]);

const pathParamRows = useKeyValueRows(pathParams);
const queryRows = useKeyValueRows(query);
const headerRows = useKeyValueRows(headers);

// Espelha `AUTO_GENERATED_HEADERS` de `src/main/http/engine.ts` — só para exibição
// (igual ao Postman: "N hidden auto-generated headers"). A engine é a única fonte da
// verdade de que eles são de fato enviados; um header configurado com o mesmo nome
// (mesma regra ali: case-insensitive) some da lista, porque o dele é que vai na rede.
const AUTO_GENERATED_HEADERS: readonly { name: string; value: string }[] = [
  { name: "User-Agent", value: "Wttp" },
  { name: "Accept", value: "*/*" },
];

const showAutoHeaders = ref(false);

const visibleAutoHeaders = computed(() =>
  AUTO_GENERATED_HEADERS.filter(
    auto =>
      !headerRows.value.some(
        row => row.enabled && row.name.toLowerCase() === auto.name.toLowerCase(),
      ),
  ),
);

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

// Content-Type sugerido a partir do tipo de body, sobrescritível à mão (useAutoContentType.ts).
useAutoContentType(body, headers);
</script>

<template>
  <div class="flex flex-col">
    <WTabs v-model="activeTab" :tabs="tabs" />

    <div v-if="activeTab === 'params'" class="flex flex-col gap-3 pt-2">
      <div v-if="pathParamRows.length > 0" class="flex flex-col gap-1">
        <p class="px-2 font-inter text-xs font-medium text-faint">
          Path Variables — add or remove by editing
          <span class="font-mono">:name</span>
          in the URL above
        </p>
        <WKeyValueTable
          v-model="pathParamRows"
          :allow-add="false"
          :allow-remove="false"
          :allow-toggle="false"
          readonly-name
          :unresolved-variables="pathParamsUnresolved"
          :variable-tooltips="pathParamsTooltips"
          :variable-names="variableNames"
        />
      </div>
      <div class="flex flex-col gap-1">
        <p v-if="pathParamRows.length > 0" class="px-2 font-inter text-xs font-medium text-faint">
          Query Params
        </p>
        <WKeyValueTable
          v-model="queryRows"
          :unresolved-variables="queryUnresolved"
          :variable-tooltips="queryTooltips"
          :variable-names="variableNames"
        />
      </div>
    </div>

    <div v-else-if="activeTab === 'headers'" class="pt-2">
      <WKeyValueTable
        v-model="headerRows"
        :unresolved-variables="headersUnresolved"
        :variable-tooltips="headersTooltips"
        :variable-names="variableNames"
      />
      <div v-if="visibleAutoHeaders.length > 0" class="border-t border-subtle">
        <button
          type="button"
          class="flex h-8 w-full items-center gap-1.5 px-2 font-inter text-xs font-medium text-faint hover:text-1"
          @click="showAutoHeaders = !showAutoHeaders"
        >
          <WIcon :name="showAutoHeaders ? 'chevron-down' : 'chevron-right'" />
          {{ showAutoHeaders ? "Hide" : "Show" }} {{ visibleAutoHeaders.length }} auto-generated
          header{{ visibleAutoHeaders.length === 1 ? "" : "s" }}
        </button>
        <div v-if="showAutoHeaders">
          <div
            v-for="row in visibleAutoHeaders"
            :key="row.name"
            class="flex h-8 items-center gap-2 border-b border-subtle px-2 last:border-b-0"
          >
            <span class="size-3.5 shrink-0" />
            <span class="w-1/4 shrink-0 truncate font-mono text-[13px] font-medium text-faint">{{
              row.name
            }}</span>
            <span class="w-1/4 shrink-0 truncate font-mono text-[13px] font-medium text-faint">{{
              row.value
            }}</span>
            <span class="flex-1" />
          </div>
        </div>
      </div>
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

      <div v-else-if="bodyType === 'json'" class="min-h-48">
        <WCodeEditor
          v-model="jsonContent"
          data-testid="body-json-editor"
          language="json"
          placeholder='{"key": "value"}'
          :unresolved-variables="bodyUnresolved"
          :variable-tooltips="bodyTooltips"
          :variable-names="variableNames"
          auto-grow
          max-height="24rem"
        />
      </div>

      <div v-else-if="bodyType === 'raw'" class="min-h-48">
        <WCodeEditor
          v-model="rawContent"
          language="text"
          :unresolved-variables="bodyUnresolved"
          :variable-tooltips="bodyTooltips"
          :variable-names="variableNames"
          auto-grow
          max-height="24rem"
        />
      </div>

      <WKeyValueTable
        v-else-if="bodyType === 'urlencoded'"
        v-model="urlencodedRows"
        :unresolved-variables="urlencodedUnresolved"
        :variable-tooltips="urlencodedTooltips"
        :variable-names="variableNames"
      />

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
            :title="row.type === 'text' ? multipartRowTooltip(row.value) : undefined"
            class="flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-faint"
            :class="
              row.type === 'text' && unresolvedNamesIn(multipartUnresolved, row.value).length > 0
                ? 'text-status-4xx'
                : 'text-1'
            "
            @input="updateMultipartRow(index, { value: ($event.target as HTMLInputElement).value })"
          />
          <button
            v-if="index < multipartEntries.length"
            type="button"
            aria-label="Remove row"
            class="flex size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            @click="removeMultipartRow(index)"
          >
            <WIcon name="x" />
          </button>
          <span v-else class="w-6 shrink-0" />
        </div>
      </div>

      <div v-else-if="bodyType === 'binary'" class="p-2 font-inter text-sm text-muted">
        The file at the path above is read and sent as the request body.
      </div>
    </div>

    <div v-else-if="activeTab === 'auth'">
      <AuthConfigEditor v-model="auth" :path="path" :headers="headers" />
    </div>

    <div v-else-if="activeTab === 'scripts'" class="flex flex-col gap-2 pt-2">
      <WTabs
        v-model="scriptsSubTab"
        :tabs="[
          { value: 'preRequest', label: 'Pre-request' },
          { value: 'tests', label: 'Post-response' },
        ]"
      />
      <div v-if="scriptsSubTab === 'preRequest'" class="h-48">
        <WCodeEditor
          v-model="preRequestScript"
          data-testid="script-prerequest-editor"
          language="javascript"
          script-phase="preRequest"
          placeholder='wttp.setVar("ts", Date.now());'
        />
      </div>
      <div v-else class="h-48">
        <WCodeEditor
          v-model="testsScript"
          data-testid="script-tests-editor"
          language="javascript"
          script-phase="tests"
          placeholder='test("status 200", () =&gt; expect(res.status).toBe(200));'
        />
      </div>
    </div>

    <div v-else-if="activeTab === 'docs'" class="min-h-40 pt-2">
      <WCodeEditor
        v-model="docs"
        language="text"
        placeholder="Document this request…"
        :unresolved-variables="docsUnresolved"
        :variable-tooltips="docsTooltips"
        :variable-names="variableNames"
        auto-grow
        max-height="24rem"
      />
    </div>
  </div>
</template>

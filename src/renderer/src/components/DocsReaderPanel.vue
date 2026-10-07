<script setup lang="ts">
import type { CodegenLanguage } from "@renderer/lib/codegen";
import type { DocsFolder, DocsItem, DocsRequest } from "@renderer/lib/docs/model";
import type { KeyValueEntry } from "@shared";

import {
  authFields,
  countRequests,
  describeBody,
  DOCS_SNIPPET_LABELS,
  DOCS_SNIPPET_LANGUAGES,
  enabledEntries,
  flattenDocs,
  redactAuth,
  redactHeaders,
  requestSnippet,
} from "@renderer/lib/docs/model";
import { useDocsReaderStore } from "@renderer/stores/docsReader";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import DocsMarkdown from "./DocsMarkdown.vue";
import WButton from "./WButton.vue";
import WEmptyState from "./WEmptyState.vue";
import WIcon from "./WIcon.vue";
import WMethodBadge from "./WMethodBadge.vue";
import WStatusBadge from "./WStatusBadge.vue";
import WTabs from "./WTabs.vue";

/**
 * Painel de leitura da documentação (EP-12-T02): a collection/pasta como um documento — a
 * documentação da pasta seguida das requests, com índice à esquerda. Request sem `docs`
 * continua aparecendo com a assinatura mínima (método, URL, params). Exemplos de
 * requisição vêm da request como escrita; o de resposta, da última execução registrada.
 */

const { t } = useI18n();
const reader = useDocsReaderStore();
const requestTabs = useRequestTabsStore();
const { model, lastRuns, exporting } = storeToRefs(reader);

const BODY_PREVIEW_CHARS = 2000;

const flat = computed(() => (model.value ? flattenDocs(model.value).slice(1) : []));
const requestCount = computed(() => (model.value ? countRequests(model.value) : 0));

const snippetLanguage = ref<CodegenLanguage>("curl");
const snippetTabs = DOCS_SNIPPET_LANGUAGES.map(language => ({
  value: language,
  label: DOCS_SNIPPET_LABELS[language],
}));

function scrollTo(anchor: string): void {
  document.getElementById(anchor)?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function headingLevelClass(depth: number): string {
  return depth <= 1 ? "text-lg" : "text-base";
}

function bodyPreview(body: string): string {
  return body.length > BODY_PREVIEW_CHARS ? `${body.slice(0, BODY_PREVIEW_CHARS)}\n…` : body;
}

function snippetFor(request: DocsRequest): string {
  return requestSnippet(request, snippetLanguage.value);
}

interface ParamRow {
  name: string;
  value: string;
  description: string;
}

function toRows(entries: KeyValueEntry[]): ParamRow[] {
  return enabledEntries(entries).map(entry => ({
    name: entry.name,
    value: entry.value,
    description: entry.description ?? "",
  }));
}

/** Seções vazias não existem — só entram as que têm linha. */
function paramGroups(request: DocsRequest): { label: string; rows: ParamRow[] }[] {
  return [
    { label: t("docsReader.pathParams"), rows: toRows(request.pathParams) },
    { label: t("docsReader.queryParams"), rows: toRows(request.query) },
    { label: t("docsReader.headers"), rows: toRows(redactHeaders(request.headers)) },
  ].filter(group => group.rows.length > 0);
}

/** Body como bloco de código cercado — o `DocsMarkdown` já cuida de highlight e `{{variáveis}}`. */
function bodyMarkdown(request: DocsRequest): string | null {
  const body = describeBody(request.body);
  if (!body) return null;
  const longestRun = Math.max(0, ...(body.text.match(/`+/g) ?? []).map(run => run.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${body.language}\n${bodyPreview(body.text)}\n${fence}`;
}

function authSummary(request: DocsRequest): ReturnType<typeof authFields> | null {
  const summary = authFields(redactAuth(request.effectiveAuth));
  return request.effectiveAuth.type === "none" ? null : summary;
}

function isRequest(item: DocsItem): item is DocsRequest {
  return item.kind === "request";
}

function asFolder(root: DocsFolder): DocsFolder {
  return root;
}
</script>

<template>
  <div v-if="!model" class="h-full">
    <WEmptyState
      :title="t('docsReader.emptyTitle')"
      :description="t('docsReader.emptyDescription')"
    />
  </div>
  <div v-else class="flex min-h-0 flex-col" data-testid="docs-reader">
    <div class="flex shrink-0 items-center gap-3 border-b border-subtle bg-surface-2 px-4 py-2">
      <WIcon name="book-open" size="4" class="text-faint" />
      <div class="min-w-0 flex-1">
        <p class="truncate font-barlow text-sm font-semibold text-1">{{ model.name }}</p>
        <p class="font-inter text-xs text-muted">
          {{ t("docsReader.requestCount", { count: requestCount }, requestCount) }}
        </p>
      </div>
      <WButton size="sm" variant="ghost" @click="reader.loadLastRuns()">
        <WIcon name="refresh-cw" />
        {{ t("docsReader.refresh") }}
      </WButton>
      <WButton size="sm" :disabled="exporting" @click="reader.exportAs('html')">
        <WIcon name="file-code" />
        {{ t("docsReader.exportHtml") }}
      </WButton>
      <WButton size="sm" :disabled="exporting" @click="reader.exportAs('markdown')">
        <WIcon name="file-text" />
        {{ t("docsReader.exportMarkdown") }}
      </WButton>
    </div>

    <div class="flex min-h-0 flex-1">
      <nav
        class="w-64 shrink-0 overflow-y-auto border-r border-subtle bg-surface-2 p-2"
        :aria-label="t('docsReader.index')"
      >
        <p class="px-2 pb-1 font-inter text-xs uppercase tracking-wide text-faint">
          {{ t("docsReader.index") }}
        </p>
        <p v-if="flat.length === 0" class="px-2 font-inter text-xs text-muted">
          {{ t("docsReader.noItems") }}
        </p>
        <button
          v-for="{ item, depth } in flat"
          :key="item.anchor"
          type="button"
          class="flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left font-inter text-xs hover:bg-surface-3"
          :class="item.kind === 'folder' ? 'font-semibold text-1' : 'text-muted'"
          :style="{ paddingLeft: `${depth * 12 - 4}px` }"
          @click="scrollTo(item.anchor)"
        >
          <WMethodBadge
            v-if="isRequest(item)"
            :method="item.method"
            class="w-8 shrink-0 !text-[10px]"
          />
          <WIcon v-else name="folder" size="3" class="text-faint" />
          <span class="truncate">{{ item.name }}</span>
        </button>
      </nav>

      <div class="min-w-0 flex-1 overflow-y-auto px-6 py-4" data-testid="docs-reader-content">
        <section :id="asFolder(model).anchor" class="mb-8">
          <h1 class="font-barlow text-2xl font-semibold text-1">{{ model.name }}</h1>
          <DocsMarkdown v-if="model.docs.trim()" :text="model.docs" :path="model.path" />
        </section>

        <section
          v-for="{ item, depth } in flat"
          :id="item.anchor"
          :key="item.anchor"
          class="mb-8 border-t border-subtle pt-4"
        >
          <template v-if="item.kind === 'folder'">
            <h2
              class="flex items-center gap-2 font-barlow font-semibold text-1"
              :class="headingLevelClass(depth)"
            >
              <WIcon name="folder" size="4" class="text-faint" />
              {{ item.name }}
            </h2>
            <DocsMarkdown v-if="item.docs.trim()" :text="item.docs" :path="item.path" />
          </template>

          <template v-else>
            <header class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <h3 class="font-barlow text-base font-semibold text-1">{{ item.name }}</h3>
                <p
                  class="mt-1.5 flex items-center gap-2 break-all rounded-md border border-subtle bg-surface-2 px-3 py-1.5 font-mono text-xs text-1"
                  data-testid="docs-signature"
                >
                  <WMethodBadge :method="item.method" class="shrink-0" />
                  <span class="min-w-0 flex-1">{{ item.url }}</span>
                </p>
              </div>
              <WButton
                size="sm"
                variant="ghost"
                data-testid="docs-open-request"
                @click="void requestTabs.openPinned(item.path)"
              >
                <WIcon name="external-link" />
                {{ t("docsReader.openRequest") }}
              </WButton>
            </header>

            <DocsMarkdown
              v-if="item.docs.trim()"
              :text="item.docs"
              :path="item.path"
              class="mt-3"
            />

            <div v-for="group in paramGroups(item)" :key="group.label" class="mt-4">
              <p class="font-inter text-xs font-semibold uppercase tracking-wide text-muted">
                {{ group.label }}
              </p>
              <div class="mt-1 overflow-hidden rounded-md border border-subtle">
                <table class="w-full border-collapse font-mono text-xs">
                  <tbody>
                    <tr
                      v-for="row in group.rows"
                      :key="row.name"
                      class="border-b border-subtle last:border-b-0 odd:bg-surface-2"
                    >
                      <td class="w-1/4 px-3 py-1.5 align-top text-1">{{ row.name }}</td>
                      <td class="break-all px-3 py-1.5 align-top text-muted">{{ row.value }}</td>
                      <td
                        v-if="group.rows.some(r => r.description)"
                        class="px-3 py-1.5 align-top font-inter text-muted"
                      >
                        {{ row.description }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="bodyMarkdown(item)" class="mt-4" data-testid="docs-body">
              <p class="font-inter text-xs font-semibold uppercase tracking-wide text-muted">
                {{ t("docsReader.body") }}
              </p>
              <DocsMarkdown :text="bodyMarkdown(item)!" :path="item.path" />
            </div>

            <div v-if="authSummary(item)" class="mt-4" data-testid="docs-auth">
              <p class="font-inter text-xs font-semibold uppercase tracking-wide text-muted">
                {{ t("docsReader.auth") }}
                <span class="ml-1 font-normal normal-case tracking-normal text-faint">
                  {{ authSummary(item)!.type
                  }}{{ item.authInherited ? ` · ${t("docsReader.authInherited")}` : "" }}
                </span>
              </p>
              <div class="mt-1 overflow-hidden rounded-md border border-subtle">
                <table class="w-full border-collapse font-mono text-xs">
                  <tbody>
                    <tr
                      v-for="[field, value] in authSummary(item)!.fields"
                      :key="field"
                      class="border-b border-subtle last:border-b-0 odd:bg-surface-2"
                    >
                      <td class="w-1/4 px-3 py-1.5 text-1">{{ field }}</td>
                      <td class="break-all px-3 py-1.5 text-muted">{{ value }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="mt-4">
              <p class="font-inter text-xs font-semibold uppercase tracking-wide text-muted">
                {{ t("docsReader.exampleRequest") }}
              </p>
              <WTabs v-model="snippetLanguage" :tabs="snippetTabs" />
              <pre class="mt-1 overflow-x-auto rounded bg-surface-3 p-2 font-mono text-xs text-1">{{
                snippetFor(item)
              }}</pre>
            </div>

            <div class="mt-3">
              <p class="font-inter text-xs font-semibold uppercase tracking-wide text-muted">
                {{ t("docsReader.exampleResponse") }}
              </p>
              <template v-if="lastRuns[item.path]">
                <template v-if="lastRuns[item.path]!.response.ok">
                  <p class="mt-1 flex items-center gap-2 font-inter text-xs text-muted">
                    <WStatusBadge
                      :code="(lastRuns[item.path]!.response as { status: number }).status"
                    />
                    {{ new Date(lastRuns[item.path]!.at).toLocaleString() }}
                  </p>
                  <pre
                    class="mt-1 max-h-72 overflow-auto rounded bg-surface-3 p-2 font-mono text-xs text-1"
                    >{{
                      bodyPreview((lastRuns[item.path]!.response as { body: string }).body)
                    }}</pre>
                </template>
                <p v-else class="mt-1 font-inter text-xs text-muted">
                  {{ t("docsReader.lastRunFailed") }}
                </p>
              </template>
              <p v-else class="mt-1 font-inter text-xs text-faint">
                {{ t("docsReader.neverRun") }}
              </p>
            </div>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>

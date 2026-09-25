<script setup lang="ts">
/**
 * Editor de `AuthConfig` (EP-07-T03) — usado na Aba Auth de uma request
 * (`RequestConfigTabs.vue`) e na aba de settings de pasta/collection (`FolderConfigTabs.vue`),
 * mesmo componente nos dois níveis porque o formato (`AuthConfig`) e as regras (tipo
 * concreto vs. `inherit`, campo secreto mascarado) são idênticas.
 *
 * Trocar de tipo preserva o que já foi digitado nos outros — um rascunho por tipo
 * (`drafts`), vivo enquanto o componente existir, do jeito que `RequestConfigTabs`
 * já faz para o tipo de body.
 */
import type { AuthConfig, KeyValueEntry } from "@shared";

import { useEffectiveAuth } from "@renderer/composables/useEffectiveAuth";
import { useVariablePreview } from "@renderer/composables/useVariablePreview";
import { useVariablesStore } from "@renderer/stores/variables";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import WCodeEditor from "./WCodeEditor.vue";
import WIcon from "./WIcon.vue";
import WSelect from "./WSelect.vue";

const props = withDefaults(
  defineProps<{
    modelValue: AuthConfig;
    /** Path do nó dono desta auth (request ou pasta) — cadeia de herança sobe a partir dele. */
    path: string;
    /** Rótulo do próprio nó no modo `inherit` ("This request" vs. "This folder") — ausente usa "Esta request". */
    selfLabel?: string;
    /**
     * Headers da request, só no nível de request — um `Authorization` manual
     * habilitado ali vence bearer/basic configurados aqui (EP-07-T02), avisado nesta
     * UI para não parecer que a auth configurada foi ignorada silenciosamente.
     */
    headers?: KeyValueEntry[];
  }>(),
  {
    selfLabel: undefined,
    headers: () => [],
  },
);

const { t } = useI18n();

const emit = defineEmits<{
  "update:modelValue": [value: AuthConfig];
}>();

const variablesStore = useVariablesStore();
const variableNames = computed(() => variablesStore.variableNamesFor(props.path));

const TYPE_OPTIONS = computed(() => [
  { value: "none", label: t("auth.types.none") },
  { value: "inherit", label: t("auth.types.inherit") },
  { value: "bearer", label: t("auth.types.bearer") },
  { value: "basic", label: t("auth.types.basic") },
  { value: "apikey", label: t("auth.types.apikey") },
]);

function defaultAuthFor(type: AuthConfig["type"]): AuthConfig {
  switch (type) {
    case "inherit":
      return { type: "inherit" };
    case "none":
      return { type: "none" };
    case "bearer":
      return { type: "bearer", bearer: { token: "" } };
    case "basic":
      return { type: "basic", basic: { username: "", password: "" } };
    case "apikey":
      return { type: "apikey", apikey: { key: "", value: "", in: "header" } };
  }
}

const drafts = new Map<AuthConfig["type"], AuthConfig>();

const authType = computed<AuthConfig["type"]>({
  get: () => props.modelValue.type,
  set: nextType => {
    drafts.set(props.modelValue.type, props.modelValue);
    emit("update:modelValue", drafts.get(nextType) ?? defaultAuthFor(nextType));
  },
});

function patchBearer(patch: Partial<{ token: string }>): void {
  if (props.modelValue.type !== "bearer") return;
  emit("update:modelValue", { type: "bearer", bearer: { ...props.modelValue.bearer, ...patch } });
}

function patchBasic(patch: Partial<{ username: string; password: string }>): void {
  if (props.modelValue.type !== "basic") return;
  emit("update:modelValue", { type: "basic", basic: { ...props.modelValue.basic, ...patch } });
}

function patchApikey(patch: Partial<{ key: string; value: string; in: "header" | "query" }>): void {
  if (props.modelValue.type !== "apikey") return;
  emit("update:modelValue", { type: "apikey", apikey: { ...props.modelValue.apikey, ...patch } });
}

const APIKEY_IN_OPTIONS = computed(() => [
  { value: "header", label: t("auth.apikeyIn.header") },
  { value: "query", label: t("auth.apikeyIn.query") },
]);

// --- Destaque/tooltip de `{{var}}` por campo (EP-06-T05/EP-06.1) ---
const bearerToken = computed(() =>
  props.modelValue.type === "bearer" ? props.modelValue.bearer.token : "",
);
const { unresolved: bearerUnresolved, tooltips: bearerTooltips } = useVariablePreview(
  bearerToken,
  computed(() => props.path),
);

const basicUsername = computed(() =>
  props.modelValue.type === "basic" ? props.modelValue.basic.username : "",
);
const { unresolved: usernameUnresolved, tooltips: usernameTooltips } = useVariablePreview(
  basicUsername,
  computed(() => props.path),
);

const basicPassword = computed(() =>
  props.modelValue.type === "basic" ? props.modelValue.basic.password : "",
);
const { unresolved: passwordUnresolved, tooltips: passwordTooltips } = useVariablePreview(
  basicPassword,
  computed(() => props.path),
);

const apikeyValue = computed(() =>
  props.modelValue.type === "apikey" ? props.modelValue.apikey.value : "",
);
const { unresolved: apikeyUnresolved, tooltips: apikeyTooltips } = useVariablePreview(
  apikeyValue,
  computed(() => props.path),
);

// --- Herança efetiva (EP-07-T01/T04) — sempre calculada, usada no badge e no modo inherit ---
const modelValueRef = computed(() => props.modelValue);
const pathRef = computed(() => props.path);
const selfLabelRef = computed(() => props.selfLabel ?? t("auth.thisRequest"));
const { effective, source, inherited } = useEffectiveAuth(modelValueRef, pathRef, selfLabelRef);

/** O store devolve "No auth configured" em inglês fixo — traduzido aqui, na borda da UI. */
const sourceLabel = computed(() =>
  source.value.kind === "none" ? t("auth.noAuthConfigured") : source.value.label,
);

const effectiveTypeLabel = computed(() => {
  switch (effective.value.type) {
    case "none":
      return t("auth.noAuth");
    case "bearer":
      return t("auth.types.bearer");
    case "basic":
      return t("auth.types.basic");
    case "apikey":
      return t("auth.types.apikey");
    default:
      return t("auth.types.none");
  }
});

const manualAuthorizationHeader = computed(() =>
  props.headers.find(h => h.enabled && h.name.toLowerCase() === "authorization"),
);
const showManualOverrideWarning = computed(
  () =>
    Boolean(manualAuthorizationHeader.value) &&
    (props.modelValue.type === "bearer" || props.modelValue.type === "basic"),
);
</script>

<template>
  <div class="flex flex-col gap-3 pt-2">
    <div class="flex items-center gap-2">
      <div class="w-40">
        <WSelect v-model="authType" :options="TYPE_OPTIONS" />
      </div>
      <span
        class="flex items-center gap-1 rounded-full border border-subtle bg-surface-2 px-2 py-0.5 font-inter text-xs text-muted"
      >
        <WIcon v-if="inherited" name="corner-down-right" size="3" class="text-faint" />
        {{ effectiveTypeLabel }}
        <span v-if="inherited">{{ t("auth.inheritedFrom", { source: sourceLabel }) }}</span>
      </span>
    </div>

    <p
      v-if="showManualOverrideWarning"
      class="flex items-center gap-1.5 rounded-md border border-status-4xx/40 bg-surface-3 px-2 py-1.5 font-inter text-xs text-status-4xx"
    >
      <WIcon name="alert-triangle" size="3.5" />
      {{ t("auth.manualOverride", { type: effectiveTypeLabel }) }}
    </p>

    <div v-if="authType === 'inherit'" class="flex flex-col gap-2">
      <p class="px-1 font-inter text-sm text-muted">
        {{ t("auth.inheritsFrom", { source: sourceLabel, type: effectiveTypeLabel }) }}
      </p>

      <div
        v-if="effective.type === 'bearer'"
        class="flex items-center gap-2 rounded-md border border-subtle bg-surface-2 px-2 py-1.5 font-mono text-[13px] text-muted"
      >
        <span class="font-inter text-xs text-faint">{{ t("auth.token") }}</span>
        <span class="truncate">{{ effective.bearer.token }}</span>
      </div>
      <div
        v-else-if="effective.type === 'basic'"
        class="flex flex-col gap-1 rounded-md border border-subtle bg-surface-2 px-2 py-1.5 font-mono text-[13px] text-muted"
      >
        <span class="font-inter text-xs text-faint">{{
          t("auth.usernameLine", { value: effective.basic.username })
        }}</span>
        <span class="font-inter text-xs text-faint">{{
          t("auth.passwordLine", { value: effective.basic.password })
        }}</span>
      </div>
      <div
        v-else-if="effective.type === 'apikey'"
        class="flex flex-col gap-1 rounded-md border border-subtle bg-surface-2 px-2 py-1.5 font-mono text-[13px] text-muted"
      >
        <span class="font-inter text-xs text-faint"
          >{{ effective.apikey.key }} ({{ effective.apikey.in }})</span
        >
        <span class="truncate">{{ effective.apikey.value }}</span>
      </div>
    </div>

    <div v-else-if="authType === 'none'" class="px-1 font-inter text-sm text-muted">
      {{ t("auth.noAuthSent") }}
    </div>

    <div v-else-if="authType === 'bearer'" class="flex flex-col gap-1">
      <label class="px-1 font-inter text-xs font-medium text-faint">{{ t("auth.token") }}</label>
      <div
        class="flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-2 focus-within:border-strong focus-within:ring-1 focus-within:ring-inset focus-within:ring-focus"
      >
        <WCodeEditor
          :model-value="bearerToken"
          single-line
          bare
          :debounce-ms="0"
          placeholder="{{access_token}}"
          :unresolved-variables="bearerUnresolved"
          :variable-tooltips="bearerTooltips"
          :variable-names="variableNames"
          class="min-w-0 flex-1"
          @update:model-value="value => patchBearer({ token: value })"
        />
      </div>
    </div>

    <div v-else-if="authType === 'basic'" class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <label class="px-1 font-inter text-xs font-medium text-faint">{{
          t("auth.username")
        }}</label>
        <div class="h-8">
          <WCodeEditor
            :model-value="basicUsername"
            single-line
            bare
            :debounce-ms="0"
            placeholder="{{user}}"
            :unresolved-variables="usernameUnresolved"
            :variable-tooltips="usernameTooltips"
            :variable-names="variableNames"
            class="h-full rounded-md border border-subtle bg-surface-2 px-2"
            @update:model-value="value => patchBasic({ username: value })"
          />
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label class="px-1 font-inter text-xs font-medium text-faint">{{
          t("auth.password")
        }}</label>
        <div
          class="flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-2 focus-within:border-strong focus-within:ring-1 focus-within:ring-inset focus-within:ring-focus"
        >
          <WCodeEditor
            :model-value="basicPassword"
            single-line
            bare
            :debounce-ms="0"
            placeholder="{{pass}}"
            :unresolved-variables="passwordUnresolved"
            :variable-tooltips="passwordTooltips"
            :variable-names="variableNames"
            class="min-w-0 flex-1"
            @update:model-value="value => patchBasic({ password: value })"
          />
        </div>
      </div>
    </div>

    <div v-else-if="authType === 'apikey'" class="flex flex-col gap-3">
      <div class="flex gap-3">
        <div class="flex flex-1 flex-col gap-1">
          <label class="px-1 font-inter text-xs font-medium text-faint">{{ t("auth.key") }}</label>
          <div
            class="flex h-8 items-center rounded-md border border-subtle bg-surface-2 px-2 focus-within:border-strong focus-within:ring-1 focus-within:ring-inset focus-within:ring-focus"
          >
            <input
              :value="props.modelValue.type === 'apikey' ? props.modelValue.apikey.key : ''"
              placeholder="X-Api-Key"
              class="w-full bg-transparent font-mono text-[13px] text-1 outline-none placeholder:text-faint"
              @input="patchApikey({ key: ($event.target as HTMLInputElement).value })"
            />
          </div>
        </div>
        <div class="w-36">
          <label class="px-1 font-inter text-xs font-medium text-faint">{{
            t("auth.addTo")
          }}</label>
          <WSelect
            :model-value="
              props.modelValue.type === 'apikey' ? props.modelValue.apikey.in : 'header'
            "
            :options="APIKEY_IN_OPTIONS"
            @update:model-value="value => patchApikey({ in: value as 'header' | 'query' })"
          />
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label class="px-1 font-inter text-xs font-medium text-faint">{{ t("auth.value") }}</label>
        <div
          class="flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-2 focus-within:border-strong focus-within:ring-1 focus-within:ring-inset focus-within:ring-focus"
        >
          <WCodeEditor
            :model-value="apikeyValue"
            single-line
            bare
            :debounce-ms="0"
            placeholder="{{api_key}}"
            :unresolved-variables="apikeyUnresolved"
            :variable-tooltips="apikeyTooltips"
            :variable-names="variableNames"
            class="min-w-0 flex-1"
            @update:model-value="value => patchApikey({ value })"
          />
        </div>
      </div>
    </div>
  </div>
</template>

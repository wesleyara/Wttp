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
import { computed, reactive } from "vue";

import WCodeEditor from "./WCodeEditor.vue";
import WIcon from "./WIcon.vue";
import WSelect from "./WSelect.vue";

const props = withDefaults(
  defineProps<{
    modelValue: AuthConfig;
    /** Path do nó dono desta auth (request ou pasta) — cadeia de herança sobe a partir dele. */
    path: string;
    /** Rótulo do próprio nó no modo `inherit` ("This request" vs. "This folder"). */
    selfLabel?: string;
    /**
     * Headers da request, só no nível de request — um `Authorization` manual
     * habilitado ali vence bearer/basic configurados aqui (EP-07-T02), avisado nesta
     * UI para não parecer que a auth configurada foi ignorada silenciosamente.
     */
    headers?: KeyValueEntry[];
  }>(),
  {
    selfLabel: "This request",
    headers: () => [],
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: AuthConfig];
}>();

const variablesStore = useVariablesStore();
const variableNames = computed(() => variablesStore.variableNamesFor(props.path));

const TYPE_OPTIONS = [
  { value: "inherit", label: "Inherit" },
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
  { value: "apikey", label: "API Key" },
] as const;

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

// --- Campos mascarados: revelar é por campo, nunca persistido, nunca revelado por padrão ---
const revealed = reactive(new Set<string>());
function toggleReveal(field: string): void {
  if (revealed.has(field)) revealed.delete(field);
  else revealed.add(field);
}

const APIKEY_IN_OPTIONS = [
  { value: "header", label: "Header" },
  { value: "query", label: "Query Param" },
] as const;

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
const selfLabelRef = computed(() => props.selfLabel);
const { effective, source, inherited } = useEffectiveAuth(modelValueRef, pathRef, selfLabelRef);

const effectiveTypeLabel = computed(() => {
  switch (effective.value.type) {
    case "none":
      return "No auth";
    case "bearer":
      return "Bearer Token";
    case "basic":
      return "Basic Auth";
    case "apikey":
      return "API Key";
    default:
      return "None";
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
        <WSelect v-model="authType" :options="[...TYPE_OPTIONS]" />
      </div>
      <span
        class="flex items-center gap-1 rounded-full border border-subtle bg-surface-2 px-2 py-0.5 font-inter text-xs text-muted"
      >
        <WIcon v-if="inherited" name="corner-down-right" size="3" class="text-faint" />
        {{ effectiveTypeLabel }}
        <span v-if="inherited">· inherited from {{ source.label }}</span>
      </span>
    </div>

    <p
      v-if="showManualOverrideWarning"
      class="flex items-center gap-1.5 rounded-md border border-status-4xx/40 bg-surface-3 px-2 py-1.5 font-inter text-xs text-status-4xx"
    >
      <WIcon name="alert-triangle" size="3.5" />
      A manually-set <span class="font-mono">Authorization</span> header overrides this — remove it
      from Headers to use {{ effectiveTypeLabel }} instead.
    </p>

    <div v-if="authType === 'inherit'" class="flex flex-col gap-2">
      <p class="px-1 font-inter text-sm text-muted">
        Inherits from <span class="font-medium text-1">{{ source.label }}</span> —
        <span class="font-medium text-1">{{ effectiveTypeLabel }}</span> will be applied.
      </p>

      <div
        v-if="effective.type === 'bearer'"
        class="flex items-center gap-2 rounded-md border border-subtle bg-surface-2 px-2 py-1.5 font-mono text-[13px] text-muted"
      >
        <span class="font-inter text-xs text-faint">Token</span>
        <span class="truncate">••••••••••••</span>
      </div>
      <div
        v-else-if="effective.type === 'basic'"
        class="flex flex-col gap-1 rounded-md border border-subtle bg-surface-2 px-2 py-1.5 font-mono text-[13px] text-muted"
      >
        <span class="font-inter text-xs text-faint">Username: {{ effective.basic.username }}</span>
        <span class="font-inter text-xs text-faint">Password: ••••••••••••</span>
      </div>
      <div
        v-else-if="effective.type === 'apikey'"
        class="flex flex-col gap-1 rounded-md border border-subtle bg-surface-2 px-2 py-1.5 font-mono text-[13px] text-muted"
      >
        <span class="font-inter text-xs text-faint"
          >{{ effective.apikey.key }} ({{ effective.apikey.in }})</span
        >
        <span class="truncate">••••••••••••</span>
      </div>
    </div>

    <div v-else-if="authType === 'none'" class="px-1 font-inter text-sm text-muted">
      No auth is sent with this request.
    </div>

    <div v-else-if="authType === 'bearer'" class="flex flex-col gap-1">
      <label class="px-1 font-inter text-xs font-medium text-faint">Token</label>
      <div
        class="flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-2 focus-within:border-strong focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-surface-1"
      >
        <input
          v-if="!revealed.has('bearer.token')"
          type="password"
          :value="bearerToken"
          placeholder="{{access_token}}"
          autocomplete="off"
          class="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-1 outline-none placeholder:text-faint"
          @input="patchBearer({ token: ($event.target as HTMLInputElement).value })"
        />
        <WCodeEditor
          v-else
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
        <button
          type="button"
          :aria-label="revealed.has('bearer.token') ? 'Hide token' : 'Reveal token'"
          class="flex size-5 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          @click="toggleReveal('bearer.token')"
        >
          <WIcon :name="revealed.has('bearer.token') ? 'eye-off' : 'eye'" />
        </button>
      </div>
    </div>

    <div v-else-if="authType === 'basic'" class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <label class="px-1 font-inter text-xs font-medium text-faint">Username</label>
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
        <label class="px-1 font-inter text-xs font-medium text-faint">Password</label>
        <div
          class="flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-2 focus-within:border-strong focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-surface-1"
        >
          <input
            v-if="!revealed.has('basic.password')"
            type="password"
            :value="basicPassword"
            placeholder="{{pass}}"
            autocomplete="off"
            class="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-1 outline-none placeholder:text-faint"
            @input="patchBasic({ password: ($event.target as HTMLInputElement).value })"
          />
          <WCodeEditor
            v-else
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
          <button
            type="button"
            :aria-label="revealed.has('basic.password') ? 'Hide password' : 'Reveal password'"
            class="flex size-5 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            @click="toggleReveal('basic.password')"
          >
            <WIcon :name="revealed.has('basic.password') ? 'eye-off' : 'eye'" />
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="authType === 'apikey'" class="flex flex-col gap-3">
      <div class="flex gap-3">
        <div class="flex flex-1 flex-col gap-1">
          <label class="px-1 font-inter text-xs font-medium text-faint">Key</label>
          <div
            class="flex h-8 items-center rounded-md border border-subtle bg-surface-2 px-2 focus-within:border-strong focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-surface-1"
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
          <label class="px-1 font-inter text-xs font-medium text-faint">Add to</label>
          <WSelect
            :model-value="
              props.modelValue.type === 'apikey' ? props.modelValue.apikey.in : 'header'
            "
            :options="[...APIKEY_IN_OPTIONS]"
            @update:model-value="value => patchApikey({ in: value as 'header' | 'query' })"
          />
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label class="px-1 font-inter text-xs font-medium text-faint">Value</label>
        <div
          class="flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-2 focus-within:border-strong focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-surface-1"
        >
          <input
            v-if="!revealed.has('apikey.value')"
            type="password"
            :value="apikeyValue"
            placeholder="{{api_key}}"
            autocomplete="off"
            class="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-1 outline-none placeholder:text-faint"
            @input="patchApikey({ value: ($event.target as HTMLInputElement).value })"
          />
          <WCodeEditor
            v-else
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
          <button
            type="button"
            :aria-label="revealed.has('apikey.value') ? 'Hide value' : 'Reveal value'"
            class="flex size-5 shrink-0 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            @click="toggleReveal('apikey.value')"
          >
            <WIcon :name="revealed.has('apikey.value') ? 'eye-off' : 'eye'" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

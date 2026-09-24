<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import WCodeEditor from "./WCodeEditor.vue";
import WInput from "./WInput.vue";
import WModal from "./WModal.vue";
import WTabs from "./WTabs.vue";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const activeTab = ref<"decode" | "encode">("decode");

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const tokenInput = ref("");
const decodeError = ref<string | null>(null);
const decodedHeader = ref("");
const decodedPayload = ref("");

/** Decode puro (sem verificar assinatura) — só base64url + `TextDecoder`, funciona para qualquer algoritmo. */
function decodeToken(token: string): void {
  decodeError.value = null;
  decodedHeader.value = "";
  decodedPayload.value = "";
  if (!token.trim()) return;

  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    decodeError.value = t("jwt.errorThreeParts");
    return;
  }
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    decodedHeader.value = JSON.stringify(header, null, 2);
    decodedPayload.value = JSON.stringify(payload, null, 2);
  } catch {
    decodeError.value = t("jwt.errorInvalidBase64");
  }
}

watch(tokenInput, decodeToken);

const headerInput = ref('{\n  "alg": "HS256",\n  "typ": "JWT"\n}');
const payloadInput = ref("{\n  \n}");
const secretInput = ref("");
const encodeError = ref<string | null>(null);
const encodedToken = ref("");

/** Assina HS256 via Web Crypto API do renderer (EP-09.1-T06) — sem `node:crypto`, sem canal IPC novo. */
async function encodeToken(): Promise<void> {
  encodeError.value = null;
  encodedToken.value = "";

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(headerInput.value);
    payload = JSON.parse(payloadInput.value);
  } catch {
    encodeError.value = t("jwt.errorInvalidJson");
    return;
  }

  try {
    const headerPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const payloadPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
    const signingInput = `${headerPart}.${payloadPart}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secretInput.value),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
    const signaturePart = base64UrlEncode(new Uint8Array(signature));
    encodedToken.value = `${signingInput}.${signaturePart}`;
  } catch {
    encodeError.value = t("jwt.errorSign");
  }
}

watch([headerInput, payloadInput, secretInput], () => void encodeToken(), { immediate: true });
</script>

<template>
  <WModal :open="open" :title="t('jwt.title')" size="xl" @close="emit('close')">
    <div class="flex flex-col gap-3">
      <WTabs
        v-model="activeTab"
        :tabs="[
          { value: 'decode', label: t('jwt.decode') },
          { value: 'encode', label: t('jwt.encode') },
        ]"
      />

      <div v-if="activeTab === 'decode'" class="grid grid-cols-2 gap-4">
        <div class="flex h-[28rem] flex-col gap-1">
          <p class="font-inter text-xs font-medium text-faint">{{ t("jwt.token") }}</p>
          <div class="min-h-0 flex-1">
            <WCodeEditor
              v-model="tokenInput"
              language="text"
              placeholder="eyJhbGciOi..."
              line-wrap
            />
          </div>
        </div>
        <div class="flex h-[28rem] flex-col gap-3">
          <p v-if="decodeError" class="font-inter text-xs text-status-5xx">{{ decodeError }}</p>
          <template v-else-if="decodedHeader">
            <div class="flex flex-col gap-1">
              <p class="font-inter text-xs font-medium text-faint">{{ t("jwt.header") }}</p>
              <div class="h-28">
                <WCodeEditor :model-value="decodedHeader" language="json" read-only line-wrap />
              </div>
            </div>
            <div class="flex min-h-0 flex-1 flex-col gap-1">
              <p class="font-inter text-xs font-medium text-faint">{{ t("jwt.payload") }}</p>
              <div class="min-h-0 flex-1">
                <WCodeEditor
                  :model-value="decodedPayload"
                  language="json"
                  read-only
                  line-wrap
                  highlight-timestamps
                />
              </div>
            </div>
          </template>
        </div>
      </div>

      <div v-else class="flex flex-col gap-3">
        <div>
          <p class="mb-1 font-inter text-xs font-medium text-faint">{{ t("jwt.header") }}</p>
          <div class="h-24">
            <WCodeEditor v-model="headerInput" language="json" />
          </div>
        </div>
        <div>
          <p class="mb-1 font-inter text-xs font-medium text-faint">{{ t("jwt.payload") }}</p>
          <div class="h-24">
            <WCodeEditor v-model="payloadInput" language="json" highlight-timestamps />
          </div>
        </div>
        <div>
          <p class="mb-1 font-inter text-xs font-medium text-faint">{{ t("jwt.secret") }}</p>
          <WInput v-model="secretInput" :placeholder="t('jwt.secretPlaceholder')" monospace />
        </div>
        <p v-if="encodeError" class="font-inter text-xs text-status-5xx">{{ encodeError }}</p>
        <div v-else-if="encodedToken">
          <p class="mb-1 font-inter text-xs font-medium text-faint">{{ t("jwt.token") }}</p>
          <div class="h-24">
            <WCodeEditor :model-value="encodedToken" language="text" read-only line-wrap />
          </div>
        </div>
      </div>
    </div>
  </WModal>
</template>

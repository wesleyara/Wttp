<script setup lang="ts">
import {
  CODEGEN_LANGUAGES,
  type CodegenLanguage,
  DEFAULT_CODEGEN_LANGUAGE,
  editorLanguageFor,
  generateCode,
  isCodegenLanguage,
} from "@renderer/lib/codegen";
import { useCodegenStore } from "@renderer/stores/codegen";
import { useRequestTabsStore } from "@renderer/stores/requestTabs";
import { useSettingsStore } from "@renderer/stores/settings";
import { useToastStore } from "@renderer/stores/toast";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import WButton from "./WButton.vue";
import WCodeEditor from "./WCodeEditor.vue";
import WModal from "./WModal.vue";
import WSelect from "./WSelect.vue";

/**
 * "Generate code" (ClickLocal #46): o snippet da request em outra linguagem, gerado da
 * mesma request resolvida do "Copy as cURL" e com a mesma regra de máscara — segredos só
 * saem com "Include secrets" ligado, que sempre volta desligado a cada abertura.
 */
const { t } = useI18n();
const codegen = useCodegenStore();
const tabs = useRequestTabsStore();
const settings = useSettingsStore();
const toast = useToastStore();

const language = ref<CodegenLanguage>(DEFAULT_CODEGEN_LANGUAGE);
const includeSecrets = ref(false);
const input = ref<Awaited<ReturnType<typeof tabs.codegenInputFor>>>(null);

watch(
  () => codegen.target,
  async target => {
    input.value = null;
    includeSecrets.value = false;
    if (!target) return;
    const saved = settings.codegenLanguage;
    language.value = isCodegenLanguage(saved) ? saved : DEFAULT_CODEGEN_LANGUAGE;
    input.value = await tabs.codegenInputFor(target.path);
  },
);

const options = computed(() =>
  CODEGEN_LANGUAGES.map(value => ({ value, label: t(`codegen.languages.${value}`) })),
);

const code = computed(() =>
  input.value
    ? generateCode(language.value, input.value.request, {
        maskSecrets: !includeSecrets.value,
        secrets: input.value.secrets,
      })
    : "",
);

const hasSecrets = computed(() => {
  const request = input.value?.request;
  if (!request) return false;
  return (input.value?.secrets.length ?? 0) > 0 || !["none", "inherit"].includes(request.auth.type);
});

function onLanguage(next: string): void {
  if (!isCodegenLanguage(next)) return;
  language.value = next;
  settings.setCodegenLanguage(next);
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(code.value);
    toast.push(t("codegen.copied"), "success");
  } catch {
    toast.push(t("toast.curlCopyFailed"), "error");
  }
}
</script>

<template>
  <WModal
    :open="codegen.target !== null"
    :title="t('codegen.title')"
    size="lg"
    @close="codegen.close"
  >
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <div class="w-48">
          <WSelect
            :model-value="language"
            :options="options"
            data-testid="codegen-language"
            @update:model-value="onLanguage"
          />
        </div>
        <label class="flex items-center gap-1.5 font-inter text-xs text-muted">
          <input
            v-model="includeSecrets"
            type="checkbox"
            class="size-3.5 accent-accent"
            data-testid="codegen-secrets"
          />
          {{ t("codegen.includeSecrets") }}
        </label>
      </div>

      <p v-if="input && input.unresolved.length > 0" class="font-inter text-xs text-status-4xx">
        {{ t("codegen.unresolved", { names: input.unresolved.join(", ") }) }}
      </p>
      <p v-else-if="hasSecrets && !includeSecrets" class="font-inter text-xs text-faint">
        {{ t("codegen.masked") }}
      </p>

      <div class="h-80" data-testid="codegen-preview">
        <WCodeEditor
          :model-value="code"
          :language="editorLanguageFor(language)"
          read-only
          line-wrap
        />
      </div>
    </div>
    <template #footer>
      <WButton variant="ghost" @click="codegen.close">{{ t("common.close") }}</WButton>
      <WButton :disabled="!input" data-testid="codegen-copy" @click="copy">
        {{ t("codegen.copy") }}
      </WButton>
    </template>
  </WModal>
</template>

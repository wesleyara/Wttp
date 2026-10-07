<script setup lang="ts">
import { Paperclip } from "@lucide/vue";
import { attachmentMarkdown, useAttachmentsStore } from "@renderer/stores/attachments";
import { useSettingsStore } from "@renderer/stores/settings";
import { useToastStore } from "@renderer/stores/toast";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import {
  calloutsPlugin,
  copyMarkdownPlugin,
  dateTimePlugin,
  emojiPlugin,
  extraBlocksPlugin,
  MarkdownEditor,
  templatesPlugin,
  textTransformPlugin,
} from "./MarkdownEditor";

/**
 * Editor de markdown dos `docs` (EP-12-T01) — o `MarkdownEditor` do repositório
 * `wesleyara/markdown-editor-poc` (wrapper de `md-editor-v3`), em `./MarkdownEditor/`, ligado
 * ao tema do app. `{{variáveis}}` aparecem na prévia com o valor do environment ativo. O
 * app abre offline e a CSP só aceita `script-src 'self'`: mermaid/katex/highlight.js vêm
 * empacotados (`MarkdownEditor/utils/setup.ts`), nada vai a uma CDN.
 */
withDefaults(
  defineProps<{
    placeholder?: string;
    /** Valor de cada `{{variável}}` resolvida — vem de `useVariablePreview`. */
    variableValues?: Record<string, string>;
    height?: string;
  }>(),
  { placeholder: "", variableValues: () => ({}), height: "24rem" },
);

const model = defineModel<string>({ required: true });

const settings = useSettingsStore();
const theme = computed(() => settings.resolvedTheme);

const { t, locale } = useI18n();
const toast = useToastStore();
const attachments = useAttachmentsStore();

// Imagens coladas ou arrastadas no editor vão para `attachments/` (versionado); o editor
// insere `![](attachments/…)` com o caminho devolvido.
function onUploadImg(files: File[], callback: (urls: string[]) => void): void {
  void attachments.saveFiles(files).then(saved => callback(saved.map(info => info.path)));
}

// Botão "Anexar imagem ou vídeo": o diálogo aceita vídeo, que colar/arrastar não cobre.
const toolbarButtons = computed(() => [
  {
    key: "attach",
    title: t("markdownEditor.attach"),
    icon: Paperclip,
    onClick: ({ insert }: { insert: (generator: () => { targetValue: string }) => void }) => {
      void attachments.pick().then(files => {
        if (files.length === 0) return;
        const text = files.map(info => attachmentMarkdown(info, info.path)).join("\n");
        insert(() => ({ targetValue: `${text}\n` }));
      });
    },
  },
]);

// Os sete plugins do wrapper, no menu "More tools". Reconstruídos quando o idioma muda,
// porque rótulos e o texto inserido (modelos, placeholders) são traduzidos na criação.
const plugins = computed(() => {
  const translate = (key: string): string => t(key);
  return [
    calloutsPlugin({ t: translate }),
    dateTimePlugin({ t: translate, locale: locale.value }),
    emojiPlugin({ t: translate }),
    templatesPlugin({ t: translate }),
    textTransformPlugin({ t: translate }),
    extraBlocksPlugin({ t: translate }),
    copyMarkdownPlugin({
      t: translate,
      onCopied: () => toast.push(t("markdownEditor.plugins.copy.copied"), "success"),
      onError: () => toast.push(t("markdownEditor.plugins.copy.failed"), "error"),
    }),
  ];
});
</script>

<template>
  <MarkdownEditor
    v-model="model"
    :theme="theme"
    :height="height"
    :placeholder="placeholder"
    :variable-values="variableValues"
    :plugins="plugins"
    :toolbar-buttons="toolbarButtons"
    :on-upload-img="onUploadImg"
    data-testid="markdown-editor"
  />
</template>

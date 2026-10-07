import { Copy } from "@lucide/vue";

import type { PluginTranslate } from "../models/markdown-editor-plugins.models";
import type { ToolbarPlugin } from "../models/markdown-toolbar.models";

import { defineToolbarPlugin } from "../utils/toolbar";

/** Exemplo de botão simples que não mexe no texto: copia o markdown para a área de transferência. */
export function copyMarkdownPlugin(options: {
  t: PluginTranslate;
  onCopied?: () => void;
  onError?: (error: unknown) => void;
}): ToolbarPlugin {
  return defineToolbarPlugin({
    name: "copy-markdown",
    buttons: [
      {
        key: "copy",
        title: options.t("markdownEditor.plugins.copy.title"),
        icon: Copy,
        onClick: async ({ getValue }) => {
          try {
            await navigator.clipboard.writeText(getValue());
            options.onCopied?.();
          } catch (error) {
            options.onError?.(error);
          }
        },
      },
    ],
  });
}

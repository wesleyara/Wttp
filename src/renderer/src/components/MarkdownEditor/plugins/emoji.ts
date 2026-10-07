import { Smile } from "@lucide/vue";

import type { PluginTranslate } from "../models/markdown-editor-plugins.models";
import type { ToolbarPlugin } from "../models/markdown-toolbar.models";

import { defineToolbarPlugin } from "../utils/toolbar";
import { text } from "./helpers";

/** Emoji e a chave do rótulo traduzido. */
const defaultEmojis = [
  { emoji: "✅", label: "done" },
  { emoji: "🚧", label: "inProgress" },
  { emoji: "⚠️", label: "warning" },
  { emoji: "❌", label: "blocked" },
  { emoji: "🐛", label: "bug" },
  { emoji: "💡", label: "idea" },
  { emoji: "🚀", label: "deploy" },
  { emoji: "👀", label: "review" },
  { emoji: "🔴", label: "priorityHigh" },
  { emoji: "🟡", label: "priorityMedium" },
  { emoji: "🟢", label: "priorityLow" },
];

/** Exemplo de dropdown configurável: emojis de status e de prioridade; a lista vem por opção
 * (`label` já traduzido). Sem ícone por item: o próprio emoji entra no rótulo. */
export function emojiPlugin(options: {
  t: PluginTranslate;
  emojis?: Array<{ emoji: string; label: string }>;
}): ToolbarPlugin {
  const { t } = options;
  const emojis =
    options.emojis ??
    defaultEmojis.map(e => ({
      emoji: e.emoji,
      label: t(`markdownEditor.plugins.emoji.${e.label}`),
    }));

  return defineToolbarPlugin({
    name: "emoji",
    buttons: [
      {
        key: "menu",
        title: t("markdownEditor.plugins.emoji.title"),
        icon: Smile,
        items: emojis.map(({ emoji, label }) => ({
          key: emoji,
          label: `${emoji}  ${label}`,
          onSelect: ({ insert }) => insert(text(`${emoji} `)),
        })),
      },
    ],
  });
}

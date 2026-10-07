import { Highlighter, Keyboard, ListCollapse, SeparatorHorizontal } from "@lucide/vue";

import type { PluginTranslate } from "../models/markdown-editor-plugins.models";
import type { ToolbarPlugin } from "../models/markdown-toolbar.models";

import { defineToolbarPlugin } from "../utils/toolbar";
import { block, text, wrap } from "./helpers";

/** Exemplo de plugin sem botões: só acrescenta itens ao menu nativo "Insert". Usa HTML inline,
 * que o md-editor-v3 renderiza (como o `<u>` do sublinhado). */
export function extraBlocksPlugin(options: { t: PluginTranslate }): ToolbarPlugin {
  const { t } = options;
  const p = (key: string): string => t(`markdownEditor.plugins.extraBlocks.${key}`);

  return defineToolbarPlugin({
    name: "extra-blocks",
    insertMenuItems: [
      {
        key: "details",
        label: p("details"),
        icon: ListCollapse,
        onSelect: ({ insert }) =>
          insert(
            wrap(
              `\n<details>\n<summary>${p("summary")}</summary>\n\n`,
              "\n\n</details>\n",
              p("content"),
            ),
          ),
      },
      {
        key: "mark",
        label: p("mark"),
        icon: Highlighter,
        onSelect: ({ insert }) => insert(wrap("<mark>", "</mark>", p("markContent"))),
      },
      {
        key: "kbd",
        label: p("kbd"),
        icon: Keyboard,
        onSelect: ({ insert }) => insert(wrap("<kbd>", "</kbd>", "Ctrl")),
      },
      {
        key: "hr",
        label: p("hr"),
        icon: SeparatorHorizontal,
        onSelect: ({ insert }) => insert(text(block("---"))),
      },
    ],
  });
}

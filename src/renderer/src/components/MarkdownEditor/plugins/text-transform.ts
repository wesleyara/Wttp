import { CaseLower, CaseSensitive, CaseUpper } from "@lucide/vue";

import type { PluginTranslate } from "../models/markdown-editor-plugins.models";
import type { InsertGenerator } from "../models/markdown-toolbar.models";
import type { ToolbarPlugin } from "../models/markdown-toolbar.models";

import { defineToolbarPlugin } from "../utils/toolbar";

/** Transforma a seleção e mantém o resultado selecionado. Sem seleção, não faz nada. */
function transform(fn: (s: string) => string): InsertGenerator {
  return selected => {
    const result = fn(selected);
    return { targetValue: result, select: result.length > 0, deviationStart: 0, deviationEnd: 0 };
  };
}

const titleCase = (s: string): string =>
  s.toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase());

/** Exemplo de dropdown que opera sobre o texto selecionado. */
export function textTransformPlugin(options: { t: PluginTranslate }): ToolbarPlugin {
  const { t } = options;
  const p = (key: string): string => t(`markdownEditor.plugins.textTransform.${key}`);

  return defineToolbarPlugin({
    name: "text-transform",
    buttons: [
      {
        key: "menu",
        title: p("title"),
        icon: CaseSensitive,
        items: [
          {
            key: "upper",
            label: p("upper"),
            icon: CaseUpper,
            onSelect: ({ insert }) => insert(transform(s => s.toUpperCase())),
          },
          {
            key: "lower",
            label: p("lower"),
            icon: CaseLower,
            onSelect: ({ insert }) => insert(transform(s => s.toLowerCase())),
          },
          {
            key: "title",
            label: p("titleCase"),
            icon: CaseSensitive,
            onSelect: ({ insert }) => insert(transform(titleCase)),
          },
        ],
      },
    ],
  });
}

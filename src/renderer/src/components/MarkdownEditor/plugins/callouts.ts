import type { Component } from "vue";

import { AlertTriangle, Info, Lightbulb, MessageSquareWarning, OctagonAlert } from "@lucide/vue";

import type { CalloutType, PluginTranslate } from "../models/markdown-editor-plugins.models";
import type { ToolbarMenuItem } from "../models/markdown-toolbar.models";
import type { ToolbarPlugin } from "../models/markdown-toolbar.models";

import { defineToolbarPlugin } from "../utils/toolbar";
import { wrap } from "./helpers";

const icons: Record<CalloutType, Component> = {
  note: Info,
  tip: Lightbulb,
  warning: AlertTriangle,
  danger: OctagonAlert,
};

/**
 * Exemplo de **dropdown próprio**. Insere blocos de admonition, sintaxe que o md-editor-v3
 * renderiza nativamente:
 *
 *     !!! warning Título
 *     conteúdo
 *     !!!
 */
export function calloutsPlugin(options: {
  t: PluginTranslate;
  types?: CalloutType[];
}): ToolbarPlugin {
  const { t } = options;
  const types = options.types ?? ["note", "tip", "warning", "danger"];

  const items: ToolbarMenuItem[] = types.map(type => {
    const label = t(`markdownEditor.plugins.callouts.${type}`);
    return {
      key: type,
      label,
      icon: icons[type],
      onSelect: ({ insert }) =>
        insert(
          wrap(`\n!!! ${type} ${label}\n`, "\n!!!\n", t("markdownEditor.plugins.callouts.content")),
        ),
    };
  });

  return defineToolbarPlugin({
    name: "callouts",
    buttons: [
      {
        key: "menu",
        title: t("markdownEditor.plugins.callouts.title"),
        icon: MessageSquareWarning,
        items,
      },
    ],
  });
}

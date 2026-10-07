import { Bug, ClipboardList, LayoutTemplate } from "@lucide/vue";

import type { MarkdownTemplate, PluginTranslate } from "../models/markdown-editor-plugins.models";
import type { ToolbarPlugin } from "../models/markdown-toolbar.models";

import { defineToolbarPlugin } from "../utils/toolbar";

export function defaultTemplates(t: PluginTranslate): MarkdownTemplate[] {
  const p = (key: string): string => t(`markdownEditor.plugins.templates.${key}`);
  return [
    {
      key: "bug",
      label: p("bug"),
      icon: Bug,
      content: `## ${p("bugDescription")}

## ${p("bugSteps")}
1.
2.

## ${p("bugExpected")}

## ${p("bugActual")}
`,
    },
    {
      key: "meeting",
      label: p("meeting"),
      icon: ClipboardList,
      content: `## ${p("meetingAttendees")}
-

## ${p("meetingAgenda")}
-

## ${p("meetingDecisions")}
- [ ]
`,
    },
  ];
}

/** Exemplo que usa `getValue`/`setValue`, além de `insert`: modelos que substituem o conteúdo
 * (pedindo confirmação se já houver texto) ou entram no cursor. */
export function templatesPlugin(options: {
  t: PluginTranslate;
  templates?: MarkdownTemplate[];
  confirm?: (message: string) => boolean;
}): ToolbarPlugin {
  const { t } = options;
  const templates = options.templates ?? defaultTemplates(t);
  const confirm = options.confirm ?? ((message: string) => window.confirm(message));

  return defineToolbarPlugin({
    name: "templates",
    buttons: [
      {
        key: "menu",
        title: t("markdownEditor.plugins.templates.title"),
        icon: LayoutTemplate,
        items: templates.map(template => ({
          key: template.key,
          label: template.label,
          icon: template.icon,
          onSelect: ({ insert, getValue, setValue, focus }) => {
            if (template.mode === "replace") {
              if (
                getValue().trim() &&
                !confirm(t("markdownEditor.plugins.templates.confirmReplace"))
              )
                return;
              setValue(template.content);
              focus();
              return;
            }
            insert(() => ({ targetValue: template.content }));
          },
        })),
      },
    ],
  });
}

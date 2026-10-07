import { Calendar, CalendarClock, Clock } from "@lucide/vue";

import type { PluginTranslate } from "../models/markdown-editor-plugins.models";
import type { ToolbarPlugin } from "../models/markdown-toolbar.models";

import { defineToolbarPlugin } from "../utils/toolbar";
import { text } from "./helpers";

/** Exemplo de dropdown com itens que calculam o valor na hora do clique. */
export function dateTimePlugin(options: { t: PluginTranslate; locale?: string }): ToolbarPlugin {
  const { t } = options;
  const locale = options.locale ?? "en";

  return defineToolbarPlugin({
    name: "date-time",
    buttons: [
      {
        key: "menu",
        title: t("markdownEditor.plugins.dateTime.title"),
        icon: CalendarClock,
        items: [
          {
            key: "date",
            label: t("markdownEditor.plugins.dateTime.date"),
            icon: Calendar,
            onSelect: ({ insert }) => insert(text(new Date().toLocaleDateString(locale))),
          },
          {
            key: "time",
            label: t("markdownEditor.plugins.dateTime.time"),
            icon: Clock,
            onSelect: ({ insert }) =>
              insert(
                text(new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })),
              ),
          },
          {
            key: "datetime",
            label: t("markdownEditor.plugins.dateTime.dateTime"),
            icon: CalendarClock,
            onSelect: ({ insert }) => insert(text(new Date().toLocaleString(locale))),
          },
          {
            key: "iso",
            label: "ISO 8601",
            icon: CalendarClock,
            onSelect: ({ insert }) => insert(text(new Date().toISOString())),
          },
        ],
      },
    ],
  });
}

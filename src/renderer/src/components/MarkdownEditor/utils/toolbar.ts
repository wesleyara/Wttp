import type { ToolbarEntry, ToolbarMenu, ToolbarPlugin } from "../models/markdown-toolbar.models";

export function isToolbarMenu(entry: ToolbarEntry): entry is ToolbarMenu {
  return "items" in entry;
}

/** Helper só para inferência de tipos: `export default defineToolbarPlugin({ ... })`. */
export function defineToolbarPlugin(plugin: ToolbarPlugin): ToolbarPlugin {
  return plugin;
}

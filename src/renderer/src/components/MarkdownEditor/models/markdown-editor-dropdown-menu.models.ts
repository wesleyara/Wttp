import type { Component } from "vue";

export interface MarkdownEditorDropdownItem {
  key: string;
  label: string;
  icon?: Component;
  /** Ação do item. Ignorada quando o item tem `children`. */
  onSelect?: () => void;
  /** Transforma o item num submenu (um nível). */
  children?: MarkdownEditorDropdownItem[];
}

export interface MarkdownEditorDropdownMenuProps {
  items: MarkdownEditorDropdownItem[];
}

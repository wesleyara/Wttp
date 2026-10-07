import type { Themes, UploadImgEvent } from "md-editor-v3";
import type { Component } from "vue";

import type { MarkdownEditorDropdownItem } from "./markdown-editor-dropdown-menu.models";
import type {
  BuiltinTool,
  ToolbarContext,
  ToolbarEntry,
  ToolbarMenuItem,
  ToolbarPlugin,
  ToolbarPluginPlacement,
} from "./markdown-toolbar.models";

export interface MarkdownEditorProps {
  modelValue: string;
  /** Altura da área de edição/preview (qualquer valor CSS). */
  height?: string;
  /** Recebe as imagens coladas/arrastadas e devolve as URLs pelo callback. Sem ele, o md-editor
   * não insere imagens coladas. */
  onUploadImg?: UploadImgEvent;
  theme?: Themes;
  /** Idioma dos textos internos do md-editor-v3 ('en-US' | 'zh-CN'). */
  language?: string;
  placeholder?: string;
  /** Abre imagens do preview num lightbox com zoom/arrastar. */
  imageLightbox?: boolean;
  /** Botões ou dropdowns extras, adicionados num grupo próprio após os nativos. */
  toolbarButtons?: ToolbarEntry[];
  /** Plugins de toolbar (ver `plugins/`). */
  plugins?: ToolbarPlugin[];
  /** Onde ficam os botões dos plugins: `'menu'` (padrão) junta todos num menu "More tools" (⋯),
   * com os dropdowns como submenus; `'toolbar'` dá a cada plugin um grupo próprio na toolbar.
   * Cada plugin pode sobrepor isso com `placement`. */
  pluginsPlacement?: ToolbarPluginPlacement;
  /** Itens extras no final do menu "Heading". */
  headingMenuItems?: ToolbarMenuItem[];
  /** Itens extras no final do menu "Insert". */
  insertMenuItems?: ToolbarMenuItem[];
  /** Ferramentas nativas a esconder (botões, menus inteiros ou itens de menu). */
  hideTools?: BuiltinTool[];
  /** Formatação com Prettier (Ctrl+Shift+F). O md-editor baixa o Prettier do CDN, então fica
   * desligado por padrão; ligue se tiver internet ou configure a instância (ver README). */
  prettier?: boolean;
  /** Blocos ```echarts. Também baixa do CDN, desligado por padrão. */
  echarts?: boolean;
  /** Valor de cada `{{variável}}` resolvida, mostrado no lugar da referência na prévia. */
  variableValues?: Record<string, string>;
}

export interface MarkdownEditorEmits {
  "update:modelValue": [value: string];
}

/** Métodos expostos via `ref` — o mesmo contexto passado às ações da toolbar. */
export type MarkdownEditorExpose = ToolbarContext;

export type MarkdownEditorViewMode = "editor" | "preview";

/** Entrada já resolvida da toolbar (nativa, extra ou de plugin), pronta para renderizar. */
export type MarkdownEditorToolbarEntry =
  | {
      kind: "button";
      key: string;
      title: string;
      icon?: Component;
      label?: string;
      action: () => void;
    }
  | {
      kind: "menu";
      key: string;
      title: string;
      icon?: Component;
      label?: string;
      items: MarkdownEditorDropdownItem[];
    };

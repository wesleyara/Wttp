/** Tipos públicos para estender a toolbar do `MarkdownEditor`. */
import type { Component } from "vue";

/** O que inserir e o que deixar selecionado depois. Semântica do md-editor-v3:
 * - `deviationStart`: deslocamento do início da seleção a partir do **início** do texto inserido;
 * - `deviationEnd`: deslocamento do fim da seleção a partir do **fim** do texto inserido
 *   (0 = até o fim, negativo = recua).
 * Ex.: `**texto**` com o `texto` selecionado → `{ deviationStart: 2, deviationEnd: -2 }`. */
export interface InsertResult {
  targetValue: string;
  select?: boolean;
  deviationStart?: number;
  deviationEnd?: number;
}

export type InsertGenerator = (selectedText: string) => InsertResult;

/** Passado a toda ação customizada da toolbar. */
export interface ToolbarContext {
  /** Insere texto na posição do cursor ou envolve a seleção atual. Ver `InsertGenerator`. */
  insert: (generator: InsertGenerator) => void;
  /** Conteúdo markdown atual. */
  getValue: () => string;
  /** Substitui todo o conteúdo (emite `update:modelValue`). */
  setValue: (value: string) => void;
  /** Devolve o foco ao editor. */
  focus: () => void;
}

/** Botão extra na toolbar. Informe `icon`, `label` ou ambos. */
export interface ToolbarButton {
  key: string;
  /** Tooltip (atributo `title`) e rótulo acessível. */
  title: string;
  icon?: Component;
  label?: string;
  /** Coloca o botão no fim de um grupo nativo da toolbar, em vez do lugar padrão. */
  group?: ToolbarGroup;
  onClick: (ctx: ToolbarContext) => void;
}

/** Grupos nativos que aceitam botões extras: `format` (B I U S) e `lists` (• 1. ☐). */
export type ToolbarGroup = "format" | "lists";

/** Item extra nos menus "Heading" ou "Insert". */
export interface ToolbarMenuItem {
  key: string;
  label: string;
  icon?: Component;
  onSelect: (ctx: ToolbarContext) => void;
}

/** Dropdown próprio na toolbar (botão com ▾ que abre uma lista de itens). */
export interface ToolbarMenu {
  key: string;
  title: string;
  icon?: Component;
  label?: string;
  /** Coloca o dropdown no fim de um grupo nativo da toolbar, em vez do lugar padrão. */
  group?: ToolbarGroup;
  items: ToolbarMenuItem[];
}

/** O que pode ir em `toolbarButtons` ou em `ToolbarPlugin.buttons`: um botão ou um dropdown. */
export type ToolbarEntry = ToolbarButton | ToolbarMenu;

/** Pacote reaproveitável de extensões da toolbar. Cada plugin ganha um grupo próprio (com
 * divisória) para os seus `buttons`; os itens de menu entram no fim dos menus nativos. */
export interface ToolbarPlugin {
  /** Identificador único; também prefixa as `key`s internas para evitar colisões. */
  name: string;
  buttons?: ToolbarEntry[];
  insertMenuItems?: ToolbarMenuItem[];
  headingMenuItems?: ToolbarMenuItem[];
  /** Ferramentas nativas que o plugin substitui/esconde. */
  hideTools?: BuiltinTool[];
  /** Onde ficam os `buttons` deste plugin; sobrepõe a prop `pluginsPlacement` do editor.
   * `'menu'`: dentro do menu "More tools" (⋯); `'toolbar'`: grupo próprio na toolbar. */
  placement?: ToolbarPluginPlacement;
}

export type ToolbarPluginPlacement = "menu" | "toolbar";

/** Chaves das ferramentas nativas, para usar em `hideTools`. */
export type BuiltinTool =
  // botões
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "unorderedList"
  | "orderedList"
  | "task"
  | "fullscreen"
  // menus inteiros
  | "headings"
  | "insert"
  // itens do menu "Heading"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "sub"
  | "sup"
  // itens do menu "Insert"
  | "quote"
  | "codeInline"
  | "codeBlock"
  | "link"
  | "image"
  | "table"
  | "mermaid"
  | "katex";

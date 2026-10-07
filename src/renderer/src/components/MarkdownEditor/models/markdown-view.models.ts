import type { Themes } from "md-editor-v3";

/** Renderização só-leitura com o mesmo pipeline do editor (mermaid, katex, highlight). */
export interface MarkdownViewProps {
  modelValue: string;
  theme?: Themes;
  language?: string;
  imageLightbox?: boolean;
  /** Blocos ```echarts (baixa o echarts do CDN). */
  echarts?: boolean;
  /** Valor de cada `{{variável}}` resolvida, mostrado no lugar da referência. */
  variableValues?: Record<string, string>;
}

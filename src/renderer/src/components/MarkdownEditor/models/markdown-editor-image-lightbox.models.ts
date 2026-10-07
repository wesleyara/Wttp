export interface MarkdownEditorImageLightboxExpose {
  /** Abre o lightbox com a imagem informada (zoom e posição reiniciados). */
  open: (src: string) => void;
  close: () => void;
}

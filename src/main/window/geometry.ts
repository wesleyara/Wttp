export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Uma janela está "na tela" se tiver ao menos `minVisible` px sobrepostos com algum
 * display — não basta o canto superior esquerdo estar dentro: um monitor desconectado
 * pode deixar a janela quase toda fora, só um fiapo visível.
 */
export function isRectOnScreen(rect: Rect, displays: Rect[], minVisible = 100): boolean {
  return displays.some(display => {
    const overlapWidth =
      Math.min(rect.x + rect.width, display.x + display.width) - Math.max(rect.x, display.x);
    const overlapHeight =
      Math.min(rect.y + rect.height, display.y + display.height) - Math.max(rect.y, display.y);
    return overlapWidth >= minVisible && overlapHeight >= minVisible;
  });
}

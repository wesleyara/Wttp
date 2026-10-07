import type { ITheme } from "@xterm/xterm";

/** `"44 62 80"` (valor de `--w-*`) → `rgb(44, 62, 80)`, a sintaxe que o xterm.js aceita. */
export function tokenToRgb(triplet: string, alpha?: number): string {
  const [r, g, b] = triplet.trim().split(/\s+/);
  return alpha === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Tema do xterm.js montado só com os tokens semânticos (`--w-*`), relidos a cada
 * troca de tema — o xterm precisa de cor resolvida, não de `var()`. As cores ANSI
 * reaproveitam os tokens de método/status (verde = 2xx, vermelho = 5xx…) em vez de
 * uma paleta crua.
 */
export function readTerminalTheme(root: HTMLElement = document.documentElement): ITheme {
  const style = getComputedStyle(root);
  const token = (name: string, alpha?: number): string =>
    tokenToRgb(style.getPropertyValue(`--w-${name}`), alpha);
  return {
    background: token("surface-2"),
    foreground: token("text-1"),
    cursor: token("text-1"),
    cursorAccent: token("surface-2"),
    selectionBackground: token("accent", 0.3),
    black: token("surface-3"),
    red: token("status-5xx"),
    green: token("status-2xx"),
    yellow: token("status-3xx"),
    blue: token("method-get"),
    magenta: token("method-patch"),
    cyan: token("accent"),
    white: token("text-muted"),
    brightBlack: token("text-faint"),
    brightRed: token("method-delete"),
    brightGreen: token("method-post"),
    brightYellow: token("method-put"),
    brightBlue: token("accent-hover"),
    brightMagenta: token("method-patch"),
    brightCyan: token("accent-hover"),
    brightWhite: token("text-1"),
  };
}

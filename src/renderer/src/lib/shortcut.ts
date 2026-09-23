/**
 * Traduz um `KeyboardEvent` capturado por `WShortcutInput` para o formato de
 * acelerador do Electron (`"CmdOrCtrl+Shift+N"`) — a mesma sintaxe já usada em
 * `src/main/menu.ts`. Usa `event.code` (tecla física), não `event.key`, para o
 * combo não mudar conforme Shift altera o caractere (`,` vira `<`, por exemplo).
 */

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
]);

const CODE_TOKENS: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Space: "Space",
  Enter: "Return",
  NumpadEnter: "Return",
  Escape: "Esc",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

/** `null` enquanto só um modificador está pressionado, ou quando nenhum Ctrl/Cmd/Alt acompanha a tecla — evita capturar um atalho que quebraria digitação normal. */
export function acceleratorFromEvent(event: KeyboardEvent): string | null {
  const { ctrlKey, metaKey, altKey, shiftKey, code } = event;
  if (MODIFIER_CODES.has(code)) return null;

  const hasPrimary = ctrlKey || metaKey;
  if (!hasPrimary && !altKey) return null;

  let token = CODE_TOKENS[code];
  if (!token) {
    if (code.startsWith("Key")) token = code.slice(3);
    else if (code.startsWith("Digit")) token = code.slice(5);
    else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) token = code;
    else return null;
  }

  const parts: string[] = [];
  if (hasPrimary) parts.push("CmdOrCtrl");
  if (altKey) parts.push("Alt");
  if (shiftKey) parts.push("Shift");
  parts.push(token);
  return parts.join("+");
}

function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? "");
}

/** Só para exibição — `"CmdOrCtrl+Shift+N"` vira `"⌘⇧N"` no macOS e `"Ctrl+Shift+N"` nos demais. */
export function formatAccelerator(accelerator: string): string {
  const parts = accelerator.split("+");
  if (!isMac()) return parts.map(part => (part === "CmdOrCtrl" ? "Ctrl" : part)).join("+");

  return parts
    .map(part => {
      switch (part) {
        case "CmdOrCtrl":
          return "⌘";
        case "Alt":
          return "⌥";
        case "Shift":
          return "⇧";
        case "Return":
          return "⏎";
        default:
          return part;
      }
    })
    .join("");
}

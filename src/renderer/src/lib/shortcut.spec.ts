// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { acceleratorFromEvent, formatAccelerator } from "./shortcut";

function keydown(init: Partial<KeyboardEventInit> & { code: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("acceleratorFromEvent", () => {
  it("monta CmdOrCtrl+<letra> para Ctrl segurado com uma letra", () => {
    expect(acceleratorFromEvent(keydown({ code: "KeyN", ctrlKey: true }))).toBe("CmdOrCtrl+N");
  });

  it("monta CmdOrCtrl+<letra> para Meta (Cmd) segurado", () => {
    expect(acceleratorFromEvent(keydown({ code: "KeyS", metaKey: true }))).toBe("CmdOrCtrl+S");
  });

  it("inclui Shift na ordem CmdOrCtrl+Shift+<tecla>", () => {
    expect(acceleratorFromEvent(keydown({ code: "KeyP", ctrlKey: true, shiftKey: true }))).toBe(
      "CmdOrCtrl+Shift+P",
    );
  });

  it("aceita Alt sozinho, sem Ctrl/Cmd", () => {
    expect(acceleratorFromEvent(keydown({ code: "KeyF", altKey: true }))).toBe("Alt+F");
  });

  it("mapeia teclas especiais para o token do Electron", () => {
    expect(acceleratorFromEvent(keydown({ code: "Enter", ctrlKey: true }))).toBe(
      "CmdOrCtrl+Return",
    );
    expect(acceleratorFromEvent(keydown({ code: "Comma", metaKey: true }))).toBe("CmdOrCtrl+,");
    expect(acceleratorFromEvent(keydown({ code: "Tab", ctrlKey: true }))).toBe("CmdOrCtrl+Tab");
  });

  it("usa o código físico da tecla, não o caractere alterado por Shift", () => {
    expect(acceleratorFromEvent(keydown({ code: "Comma", ctrlKey: true, shiftKey: true }))).toBe(
      "CmdOrCtrl+Shift+,",
    );
  });

  it("devolve null quando só um modificador está pressionado", () => {
    expect(acceleratorFromEvent(keydown({ code: "ControlLeft", ctrlKey: true }))).toBeNull();
    expect(acceleratorFromEvent(keydown({ code: "ShiftLeft", shiftKey: true }))).toBeNull();
  });

  it("devolve null sem Ctrl/Cmd/Alt, mesmo com Shift", () => {
    expect(acceleratorFromEvent(keydown({ code: "KeyN", shiftKey: true }))).toBeNull();
    expect(acceleratorFromEvent(keydown({ code: "KeyN" }))).toBeNull();
  });

  it("devolve null para uma tecla sem token conhecido", () => {
    expect(acceleratorFromEvent(keydown({ code: "IntlRo", ctrlKey: true }))).toBeNull();
  });
});

describe("formatAccelerator", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("em plataforma não-mac, troca CmdOrCtrl por Ctrl", () => {
    vi.stubGlobal("navigator", { platform: "Linux x86_64" });
    expect(formatAccelerator("CmdOrCtrl+Shift+N")).toBe("Ctrl+Shift+N");
  });

  it("no macOS, usa os símbolos nativos sem separador", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    expect(formatAccelerator("CmdOrCtrl+Shift+N")).toBe("⌘⇧N");
  });
});

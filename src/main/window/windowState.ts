import type { BrowserWindow } from "electron";

import { screen } from "electron";

import { appDataDir } from "../config/appDataDir";
import { readJsonFile, writeJsonFile } from "../config/jsonFile";
import { isRectOnScreen } from "./geometry";

const FILE = "window-state.json";
const SAVE_DEBOUNCE_MS = 400;

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

const DEFAULT_STATE: WindowState = { width: 1280, height: 800, isMaximized: false };

/** Bounds salvos, descartando posição fora de qualquer display conectado hoje. */
export async function loadWindowState(): Promise<WindowState> {
  const saved = await readJsonFile(appDataDir(), FILE, DEFAULT_STATE);
  if (saved.x === undefined || saved.y === undefined) return saved;

  const displays = screen.getAllDisplays().map(d => d.bounds);
  const rect = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
  if (isRectOnScreen(rect, displays)) return saved;

  return { width: saved.width, height: saved.height, isMaximized: saved.isMaximized };
}

/** Salva (com debounce) a cada resize/move e uma última vez, sem debounce, ao fechar. */
export function watchWindowState(win: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function currentState(): WindowState {
    const isMaximized = win.isMaximized();
    const bounds = win.getNormalBounds();
    return { ...bounds, isMaximized };
  }

  function scheduleSave(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(
      () => void writeJsonFile(appDataDir(), FILE, currentState()),
      SAVE_DEBOUNCE_MS,
    );
  }

  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("close", () => {
    if (timer) clearTimeout(timer);
    void writeJsonFile(appDataDir(), FILE, currentState());
  });
}

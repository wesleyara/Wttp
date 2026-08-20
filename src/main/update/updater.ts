import type { AppSettings, UpdateStatus } from "@shared";
import type { BrowserWindow } from "electron";

import { autoUpdater } from "electron-updater";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { appDataDir } from "../config/appDataDir";
import { readJsonFile } from "../config/jsonFile";

const SETTINGS_FILE = "settings.json";
const DEFAULT_SETTINGS: AppSettings = { theme: "system", autoUpdateEnabled: true };
const INITIAL_CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let targetWindow: BrowserWindow | null = null;
let lastStatus: UpdateStatus = { state: "idle" };

function sendStatus(status: UpdateStatus): void {
  lastStatus = status;
  targetWindow?.webContents.send("update:status", status);
}

/**
 * Leitura sob demanda (`update:getStatus`) — cobre o status enviado no boot antes de
 * qualquer listener do renderer existir (ver o comentário no `IpcContract`).
 */
export function getCurrentStatus(): UpdateStatus {
  return lastStatus;
}

/**
 * `.deb`/`.rpm`/`.pacman` instalam com `dpkg`/`rpm`/`pacman`, que exigem root —
 * `electron-updater`'s `DebUpdater`/`RpmUpdater`/`PacmanUpdater` tentam rodar isso via
 * sudo em nome do usuário, uma experiência ruim e fora do que a task pede
 * ("fica a cargo do gerenciador de pacotes"). `electron-builder` só grava
 * `resources/package-type` para esses três alvos — ausência do arquivo é AppImage
 * (identificado pelo próprio `electron-updater` via `process.env.APPIMAGE`) ou um SO
 * que não é Linux, os dois casos suportados.
 */
function isUnsupportedLinuxPackage(): boolean {
  if (process.platform !== "linux") return false;
  const packageTypeFile = join(process.resourcesPath, "package-type");
  if (!existsSync(packageTypeFile)) return false;
  return readFileSync(packageTypeFile, "utf8").trim().length > 0;
}

async function isAutoUpdateEnabled(): Promise<boolean> {
  const settings = await readJsonFile(appDataDir(), SETTINGS_FILE, DEFAULT_SETTINGS);
  return settings.autoUpdateEnabled !== false;
}

/**
 * Checagem manual ("Check for updates" nas Preferences, EP-11-T03) — roda sempre,
 * mesmo com a checagem automática desligada (`autoUpdateEnabled: false` só afeta o
 * agendamento em `initAutoUpdater`, nunca um clique explícito do usuário). Num pacote
 * `.deb` só reafirma o status `unsupported`, sem tentar checar.
 */
export async function checkForUpdatesNow(): Promise<void> {
  if (isUnsupportedLinuxPackage()) {
    sendStatus({ state: "unsupported", reason: "linux-package" });
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // O listener "error" registrado em initAutoUpdater já reporta isso ao renderer —
    // evita empurrar o mesmo status duas vezes.
  }
}

/** Reinicia o app e troca o binário pelo update já baixado — só chamado depois de um `update:status` com `state: "downloaded"`. */
export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}

/**
 * Chamado uma vez no bootstrap (`src/main/index.ts`), depois da janela principal
 * existir — todo `update:status` é entregue a ela via `webContents.send`.
 */
export function initAutoUpdater(win: BrowserWindow): void {
  targetWindow = win;

  // Download em background assim que uma versão nova é encontrada; a troca do
  // binário só acontece quando o app fecha (`quitAndInstall` explícito via
  // `update:install`, ou naturalmente no próximo restart) — nunca reinicia sozinho no
  // meio de uma sessão sem o usuário pedir.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => sendStatus({ state: "checking" }));
  autoUpdater.on("update-available", info =>
    sendStatus({ state: "available", version: info.version }),
  );
  autoUpdater.on("update-not-available", () => sendStatus({ state: "not-available" }));
  autoUpdater.on("download-progress", progress =>
    sendStatus({ state: "downloading", percent: Math.round(progress.percent) }),
  );
  autoUpdater.on("update-downloaded", info =>
    sendStatus({ state: "downloaded", version: info.version }),
  );
  // Falha de rede na checagem é silenciosa (critério de aceite de EP-11-T03) — nunca
  // vira alerta, só um status neutro que a tela de Preferences mostra se o usuário
  // estiver olhando ali na hora.
  autoUpdater.on("error", () => sendStatus({ state: "error" }));

  if (isUnsupportedLinuxPackage()) {
    sendStatus({ state: "unsupported", reason: "linux-package" });
    return;
  }

  const scheduledCheck = async (): Promise<void> => {
    if (!(await isAutoUpdateEnabled())) return;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // ver comentário do listener "error" acima.
    }
  };

  setTimeout(() => void scheduledCheck(), INITIAL_CHECK_DELAY_MS);
  setInterval(() => void scheduledCheck(), CHECK_INTERVAL_MS);
}

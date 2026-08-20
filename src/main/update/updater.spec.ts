import type { BrowserWindow } from "electron";

import { promises as fsPromises } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mesmo padrão de `storage/recentWorkspaces.spec.ts`: `appDataDir()` chama
// `app.getPath` do Electron, que não existe fora do runtime real.
let userDataDir: string;

vi.mock("electron", () => ({
  app: { getPath: () => userDataDir },
}));

const checkForUpdates = vi.fn(async () => undefined);
const quitAndInstall = vi.fn();
const autoUpdaterMock = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  on: vi.fn(),
  checkForUpdates,
  quitAndInstall,
};

// `electron-updater`'s singleton real dispararia rede de verdade (`checkForUpdates`) —
// mockado como um objeto de eventos/spies simples, sem nenhuma das duas coisas.
vi.mock("electron-updater", () => ({ autoUpdater: autoUpdaterMock }));

const { checkForUpdatesNow, initAutoUpdater, installUpdate } = await import("./updater");

function fakeWindow(): { win: BrowserWindow; sent: unknown[][] } {
  const sent: unknown[][] = [];
  const win = {
    webContents: { send: (...args: unknown[]) => sent.push(args) },
  } as unknown as BrowserWindow;
  return { win, sent };
}

/** `process.platform`/`process.resourcesPath` são normalmente readonly — sobrescritos e restaurados a cada teste. */
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

function setResourcesPath(dir: string): void {
  Object.defineProperty(process, "resourcesPath", { value: dir, configurable: true });
}

describe("main/update/updater", () => {
  const originalPlatform = process.platform;
  const originalResourcesPath = process.resourcesPath;
  let resourcesDir: string;

  beforeEach(async () => {
    userDataDir = await fsPromises.mkdtemp(join(tmpdir(), "wttp-updater-userdata-"));
    resourcesDir = await fsPromises.mkdtemp(join(tmpdir(), "wttp-updater-resources-"));
    setResourcesPath(resourcesDir);
    checkForUpdates.mockClear();
    quitAndInstall.mockClear();
  });

  afterEach(async () => {
    setPlatform(originalPlatform);
    setResourcesPath(originalResourcesPath);
    await fsPromises.rm(userDataDir, { recursive: true, force: true });
    await fsPromises.rm(resourcesDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it("num pacote .deb (resources/package-type presente), nunca chama autoUpdater.checkForUpdates e reporta unsupported", async () => {
    setPlatform("linux");
    writeFileSync(join(resourcesDir, "package-type"), "deb");
    const { win, sent } = fakeWindow();
    initAutoUpdater(win);

    await checkForUpdatesNow();

    expect(checkForUpdates).not.toHaveBeenCalled();
    expect(sent).toContainEqual([
      "update:status",
      { state: "unsupported", reason: "linux-package" },
    ]);
  });

  it("no Linux sem package-type (AppImage), a checagem manual chama autoUpdater.checkForUpdates normalmente", async () => {
    setPlatform("linux");
    const { win } = fakeWindow();
    initAutoUpdater(win);

    await checkForUpdatesNow();

    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("fora do Linux, um package-type presente (não deveria existir, mas por garantia) não bloqueia a checagem", async () => {
    setPlatform("darwin");
    writeFileSync(join(resourcesDir, "package-type"), "deb");
    const { win } = fakeWindow();
    initAutoUpdater(win);

    await checkForUpdatesNow();

    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("com autoUpdateEnabled: false salvo, a checagem agendada no boot nunca dispara — só a manual", async () => {
    setPlatform("darwin");
    mkdirSync(userDataDir, { recursive: true });
    writeFileSync(
      join(userDataDir, "settings.json"),
      JSON.stringify({ theme: "system", autoUpdateEnabled: false }),
    );
    vi.useFakeTimers();
    const { win } = fakeWindow();

    initAutoUpdater(win);
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000 + 60_000);

    expect(checkForUpdates).not.toHaveBeenCalled();
  });

  it("installUpdate delega em autoUpdater.quitAndInstall", () => {
    installUpdate();
    expect(quitAndInstall).toHaveBeenCalledTimes(1);
  });
});

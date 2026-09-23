// @vitest-environment jsdom
import { i18n } from "@renderer/i18n";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSettingsStore } from "./settings";

const get = vi.fn(async () => ({ theme: "dark" as const, workspacesRootDir: "/root" }));
const set = vi.fn(async () => ({ theme: "dark" as const, workspacesRootDir: "/root" }));
const reset = vi.fn(async () => ({ theme: "system" as const, workspacesRootDir: undefined }));
const getDefaultAccelerators = vi.fn(async () => ({
  "request:new": "CmdOrCtrl+N",
  "request:save": "CmdOrCtrl+S",
}));

beforeEach(() => {
  setActivePinia(createPinia());
  get.mockClear();
  set.mockClear();
  reset.mockClear();
  getDefaultAccelerators.mockClear();

  vi.stubGlobal("window", {
    wttp: {
      settings: { get, set, reset },
      menu: { getDefaultAccelerators },
    },
  });
  vi.stubGlobal("matchMedia", undefined);
});

describe("useSettingsStore language", () => {
  it("setLanguage troca o locale na hora e persiste via settings:set", async () => {
    const settings = useSettingsStore();
    await settings.load();

    settings.setLanguage("pt-BR");
    expect(i18n.global.locale.value).toBe("pt-BR");
    expect(set).toHaveBeenCalledWith({ language: "pt-BR" });

    settings.setLanguage("en");
    expect(i18n.global.locale.value).toBe("en");
  });

  it("load aplica o idioma salvo; ausente se comporta como system", async () => {
    get.mockResolvedValueOnce({ theme: "dark" as const, language: "pt-BR" } as never);
    const settings = useSettingsStore();
    await settings.load();
    expect(settings.language).toBe("pt-BR");
    expect(i18n.global.locale.value).toBe("pt-BR");

    get.mockResolvedValueOnce({ theme: "dark" as const } as never);
    await settings.load();
    expect(settings.language).toBe("system");
  });
});

describe("useSettingsStore", () => {
  it("resetToDefaults chama settings:reset e aplica o resultado localmente", async () => {
    const settings = useSettingsStore();
    await settings.load();
    settings.setWorkspacesRootDir("/somewhere-else");

    await settings.resetToDefaults();

    expect(reset).toHaveBeenCalledTimes(1);
    expect(settings.theme).toBe("system");
    expect(settings.workspacesRootDir).toBeUndefined();
  });

  it("effectiveAccelerator cai no padrão quando a ação não foi remapeada", async () => {
    const settings = useSettingsStore();
    await settings.load();

    expect(settings.effectiveAccelerator("request:new")).toBe("CmdOrCtrl+N");
  });

  it("setShortcut sobrescreve o efetivo e persiste só as ações remapeadas", async () => {
    const settings = useSettingsStore();
    await settings.load();

    settings.setShortcut("request:new", "CmdOrCtrl+Shift+N");

    expect(settings.effectiveAccelerator("request:new")).toBe("CmdOrCtrl+Shift+N");
    expect(set).toHaveBeenCalledWith({ shortcuts: { "request:new": "CmdOrCtrl+Shift+N" } });
  });

  it("restoreShortcut remove a sobrescrita e volta ao padrão", async () => {
    const settings = useSettingsStore();
    await settings.load();
    settings.setShortcut("request:new", "CmdOrCtrl+Shift+N");

    settings.restoreShortcut("request:new");

    expect(settings.effectiveAccelerator("request:new")).toBe("CmdOrCtrl+N");
    expect(set).toHaveBeenLastCalledWith({ shortcuts: {} });
  });

  it("resetShortcuts limpa todas as sobrescritas sem mexer em tema/pasta", async () => {
    const settings = useSettingsStore();
    await settings.load();
    settings.setShortcut("request:new", "CmdOrCtrl+Shift+N");
    settings.setShortcut("request:save", "CmdOrCtrl+Shift+S");

    settings.resetShortcuts();

    expect(settings.shortcuts).toEqual({});
    expect(settings.effectiveAccelerator("request:new")).toBe("CmdOrCtrl+N");
    expect(settings.theme).toBe("dark");
    expect(set).toHaveBeenLastCalledWith({ shortcuts: {} });
  });

  it("findAcceleratorOwner acha a ação que já usa o acelerador, excluindo a própria", async () => {
    const settings = useSettingsStore();
    await settings.load();

    expect(settings.findAcceleratorOwner("CmdOrCtrl+S")).toBe("request:save");
    expect(settings.findAcceleratorOwner("CmdOrCtrl+S", "request:save")).toBeNull();
    expect(settings.findAcceleratorOwner("CmdOrCtrl+Shift+Z")).toBeNull();
  });
});

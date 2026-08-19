// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSettingsStore } from "./settings";

const get = vi.fn(async () => ({ theme: "dark" as const, workspacesRootDir: "/root" }));
const set = vi.fn(async () => ({ theme: "dark" as const, workspacesRootDir: "/root" }));
const reset = vi.fn(async () => ({ theme: "system" as const, workspacesRootDir: undefined }));

beforeEach(() => {
  setActivePinia(createPinia());
  get.mockClear();
  set.mockClear();
  reset.mockClear();

  vi.stubGlobal("window", {
    wttp: {
      settings: { get, set, reset },
    },
  });
  vi.stubGlobal("matchMedia", undefined);
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
});

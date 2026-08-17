import type { ElectronAPI } from "@electron-toolkit/preload";
import type { AppInfo, AppSettings, UiState } from "@shared";

interface WttpApi {
  app: {
    ping: () => Promise<AppInfo>;
  };
  ui: {
    getState: () => Promise<UiState>;
    setState: (patch: Partial<UiState>) => Promise<UiState>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    wttp: WttpApi;
  }
}

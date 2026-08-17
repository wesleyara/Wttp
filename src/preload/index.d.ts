import type { ElectronAPI } from "@electron-toolkit/preload";
import type { AppInfo, UiState } from "@shared";

interface WttpApi {
  app: {
    ping: () => Promise<AppInfo>;
  };
  ui: {
    getState: () => Promise<UiState>;
    setState: (patch: Partial<UiState>) => Promise<UiState>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    wttp: WttpApi;
  }
}

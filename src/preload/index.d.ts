import type { ElectronAPI } from "@electron-toolkit/preload";
import type { AppInfo } from "@shared";

interface WttpApi {
  app: {
    ping: () => Promise<AppInfo>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    wttp: WttpApi;
  }
}

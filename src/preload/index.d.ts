import type { ElectronAPI } from "@electron-toolkit/preload";
import type {
  AppInfo,
  AppSettings,
  HttpRequestSpec,
  HttpResponseResult,
  MenuAction,
  UiState,
} from "@shared";

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
  http: {
    send: (spec: HttpRequestSpec) => Promise<HttpResponseResult>;
    cancel: (requestId: string) => Promise<void>;
  };
  menu: {
    onAction: (callback: (action: MenuAction) => void) => () => void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    wttp: WttpApi;
  }
}

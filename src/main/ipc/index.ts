import { registerAppHandlers } from "./app";
import { registerSettingsHandlers } from "./settings";
import { registerUiHandlers } from "./ui";

/** Um `register*Handlers` por domínio, chamado uma vez no bootstrap do main. */
export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerUiHandlers();
  registerSettingsHandlers();
}

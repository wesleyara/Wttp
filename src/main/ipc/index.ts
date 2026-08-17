import { registerAppHandlers } from "./app";
import { registerDialogHandlers } from "./dialog";
import { registerHttpHandlers } from "./http";
import { registerNodeHandlers } from "./node";
import { registerSecretHandlers } from "./secrets";
import { registerSettingsHandlers } from "./settings";
import { registerUiHandlers } from "./ui";
import { registerWorkspaceHandlers } from "./workspace";

/** Um `register*Handlers` por domínio, chamado uma vez no bootstrap do main. */
export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerUiHandlers();
  registerSettingsHandlers();
  registerHttpHandlers();
  registerDialogHandlers();
  registerWorkspaceHandlers();
  registerNodeHandlers();
  registerSecretHandlers();
}

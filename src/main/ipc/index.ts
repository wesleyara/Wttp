import { registerAppHandlers } from "./app";
import { registerDialogHandlers } from "./dialog";
import { registerEnvironmentHandlers } from "./environment";
import { registerHttpHandlers } from "./http";
import { registerImportHandlers } from "./import";
import { registerNodeHandlers } from "./node";
import { registerScriptHandlers } from "./scripts";
import { registerSecretHandlers } from "./secrets";
import { registerSettingsHandlers } from "./settings";
import { registerUiHandlers } from "./ui";
import { registerVariableHandlers } from "./variables";
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
  registerEnvironmentHandlers();
  registerVariableHandlers();
  registerImportHandlers();
  registerScriptHandlers();
}

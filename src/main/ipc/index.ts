import { registerAppHandlers } from "./app";
import { registerDialogHandlers } from "./dialog";
import { registerEnvironmentHandlers } from "./environment";
import { registerGitHandlers } from "./git";
import { registerHistoryHandlers } from "./history";
import { registerHttpHandlers } from "./http";
import { registerImportHandlers } from "./import";
import { registerMenuHandlers } from "./menu";
import { registerNodeHandlers } from "./node";
import { registerRunnerHandlers } from "./runner";
import { registerScriptHandlers } from "./scripts";
import { registerSecretHandlers } from "./secrets";
import { registerSettingsHandlers } from "./settings";
import { registerUiHandlers } from "./ui";
import { registerUpdateHandlers } from "./update";
import { registerVariableHandlers } from "./variables";
import { registerWorkspaceHandlers } from "./workspace";

/** Um `register*Handlers` por domínio, chamado uma vez no bootstrap do main. */
export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerUiHandlers();
  registerSettingsHandlers();
  registerMenuHandlers();
  registerHttpHandlers();
  registerDialogHandlers();
  registerWorkspaceHandlers();
  registerNodeHandlers();
  registerSecretHandlers();
  registerEnvironmentHandlers();
  registerVariableHandlers();
  registerImportHandlers();
  registerScriptHandlers();
  registerHistoryHandlers();
  registerRunnerHandlers();
  registerGitHandlers();
  registerUpdateHandlers();
}

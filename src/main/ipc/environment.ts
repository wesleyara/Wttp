import { removeEnvironment, saveEnvironment } from "../storage/environments";
import { duplicateEnvironment, listEnvironments } from "../storage/tree";
import { registerHandler } from "./registry";

export function registerEnvironmentHandlers(): void {
  registerHandler("env:list", payload => listEnvironments(payload.root));

  registerHandler("env:save", payload =>
    saveEnvironment({
      root: payload.root,
      path: payload.path,
      name: payload.name,
      variables: payload.variables,
    }),
  );

  registerHandler("env:delete", payload => removeEnvironment(payload.root, payload.path));
  registerHandler("env:duplicate", payload => duplicateEnvironment(payload.root, payload.path));
}

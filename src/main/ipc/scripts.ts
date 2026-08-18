import { runScript } from "../scripts/runner";
import { registerHandler } from "./registry";

export function registerScriptHandlers(): void {
  registerHandler("script:run", spec => runScript(spec));
}

import { registerAppHandlers } from "./app";
import { registerUiHandlers } from "./ui";

/** Um `register*Handlers` por domínio, chamado uma vez no bootstrap do main. */
export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerUiHandlers();
}

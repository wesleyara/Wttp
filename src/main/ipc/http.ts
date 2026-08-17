import { cancelHttpRequest, sendHttpRequest } from "../http/engine";
import { registerHandler } from "./registry";

export function registerHttpHandlers(): void {
  registerHandler("http:send", spec => sendHttpRequest(spec));
  registerHandler("http:cancel", requestId => {
    cancelHttpRequest(requestId);
  });
}
